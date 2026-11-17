export interface HttpServerHandle {
  origin:string;
  close():Promise<void>;
}
export type StartHttpServer = (handler:(request:Request)=>Response|Promise<Response>)=>Promise<HttpServerHandle>;
