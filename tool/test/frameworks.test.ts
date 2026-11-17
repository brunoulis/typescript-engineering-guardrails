import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { inspectFrameworks } from '../src/rules/frameworks.js';

function findings(text: string): { code: string; line: number }[] {
  const source = ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const results: {code:string;line:number}[] = [];
  inspectFrameworks(source,ts,(code,_severity,line) => results.push({code,line}));
  return results;
}
function codes(text:string): string[] { return findings(text).map(finding=>finding.code); }

test('Better Auth imported alias and namespace literal options, without unrelated/shadowed/type-only calls',()=>{
  assert.deepEqual(codes(`import {betterAuth as auth} from 'better-auth';
auth({advanced:{disableOriginCheck:true,disableCSRFCheck:true}});`),['BETTER_AUTH_SECURITY_DISABLED','BETTER_AUTH_SECURITY_DISABLED']);
  assert.deepEqual(codes(`import * as auth from 'better-auth'; auth.betterAuth({advanced:{disableOriginCheck:true}});`),['BETTER_AUTH_SECURITY_DISABLED']);
  assert.deepEqual(codes(`import {betterAuth as auth} from 'better-auth';
auth({advanced:{disableOriginCheck:false}});
function f(auth:any){auth({advanced:{disableOriginCheck:true}})}
other({disableOriginCheck:true});
auth({metadata:{disableOriginCheck:true}});
`),[]);
  assert.deepEqual(codes(`import type {betterAuth} from 'better-auth'; betterAuth({advanced:{disableOriginCheck:true}});`),[]);
  assert.deepEqual(codes(`import {betterAuth} from './fake'; betterAuth({advanced:{disableOriginCheck:true}});`),[]);
});

test('Drizzle factory-created db mutations: one lead per outer chain, predicates retained',()=>{
  assert.deepEqual(codes(`import {drizzle as connect} from 'drizzle-orm/node-postgres';
const db=connect(pool);
db.update(table).set({name:'x'}).returning();
db.delete(table);
db.update(table).set({name:'x'}).where(eq(table.id,id)).returning();
db.delete(table).where(eq(table.id,id));`),['DRIZZLE_MUTATION_WITHOUT_WHERE','DRIZZLE_MUTATION_WITHOUT_WHERE']);
  assert.deepEqual(codes(`import * as driver from 'drizzle-orm/postgres-js'; const db=driver.drizzle(sql);
db.transaction(async tx=>{await tx.delete(table)});`),['DRIZZLE_MUTATION_WITHOUT_WHERE']);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres'; const db=drizzle(pool);
function f(db:any){db.delete(table)}
unrelated.update(table).set({});
const custom={update(){}};custom.update();`),[]);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';const db=drizzle(pool);db.execute(sql).update(t);`),[]);
});

test('Drizzle raw HTTP set uses verified HTTP request origins, not arbitrary json names',()=>{
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';
import type {Context as HttpContext} from 'hono';const db=drizzle(pool);
async function route(c:HttpContext){const body=await c.req.json();await db.update(table).set(body).where(eq(table.id,id));}`),['DRIZZLE_RAW_REQUEST_SET']);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';import {Hono as Router} from 'hono';
const db=drizzle(pool);const app=new Router();app.post('/x',async c=>db.update(t).set(await c.req.json()).where(eq(t.id,id)));`),['DRIZZLE_RAW_REQUEST_SET']);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';const db=drizzle(pool);
async function route(request:Request){await db.update(t).set(await request.json()).where(eq(t.id,id));}`),['DRIZZLE_RAW_REQUEST_SET']);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';const db=drizzle(pool);
async function route(request:Request){const parsed=schema.parse(await request.json());await db.update(t).set(parsed).where(eq(t.id,id))}
db.update(t).set(await arbitrary.json()).where(eq(t.id,id));
function f(request:any){db.update(t).set(request.json()).where(eq(t.id,id))}`),[]);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';import {Hono} from 'hono';const db=drizzle(pool);const app=new Hono();
const unrelated=app.request('/x');unrelated.get('/x',async c=>db.update(t).set(await c.req.json()).where(eq(t.id,id)));`),[]);
});

test('pg pool transaction pitfall follows imports/factory bindings and excludes acquired clients',()=>{
  assert.deepEqual(codes(`import {Pool as PgPool} from 'pg';const pool=new PgPool();pool.query('BEGIN');pool.query('begin isolation level serializable');`),['PG_POOL_TRANSACTION','PG_POOL_TRANSACTION']);
  assert.deepEqual(codes(`import pg from 'pg';const pool=new pg.Pool();pool.query({text:'BEGIN'});`),['PG_POOL_TRANSACTION']);
  assert.deepEqual(codes(`import * as pg from 'pg';const pool=new pg.Pool();pool.query('BEGIN');`),['PG_POOL_TRANSACTION']);
  assert.deepEqual(codes(`import {Pool} from 'pg'; const pool=new Pool();const client=await pool.connect();client.query('BEGIN');pool.query('SELECT 1');
function f(pool:any){pool.query('BEGIN')}
function g(Pool:any){const other=new Pool();other.query('BEGIN')}
function h(){if(enabled){var pool=custom;}pool.query('BEGIN')}
const nested=function Pool(){const pool=new Pool();pool.query('BEGIN')};
`),[]);
  assert.deepEqual(codes(`import {Pool} from './unrelated';const pool=new Pool();pool.query('BEGIN');`),[]);
  assert.deepEqual(codes(`import {Pool} from 'pg';const pool=new Pool();pool.query('BEGINNING');pool.query(dynamicSql);pool.query('/* comment */ BEGIN');`),[]);
});

test('stable one-based source locations and lexical block shadowing',()=>{
  assert.deepEqual(findings(`import {Pool} from 'pg';
const pool=new Pool();
{const pool=custom;pool.query('BEGIN')}
pool.query('BEGIN');`),[{code:'PG_POOL_TRANSACTION',line:4}]);
  assert.deepEqual(codes(`import {betterAuth as auth} from 'better-auth';
function f({auth}:{auth:Function}){auth({advanced:{disableOriginCheck:true}})}`),[]);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';const {db}=drizzle(pool);db.delete(t);`),[]);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';const db=drizzle(pool);((db.update(t))).set({}).where(eq(t.id,id));`),[]);
  assert.deepEqual(codes(`import {drizzle} from 'drizzle-orm/node-postgres';const db=drizzle(pool);type Request=Custom;
async function route(request:Request){db.update(t).set(await request.json()).where(eq(t.id,id))}`),[]);
});
