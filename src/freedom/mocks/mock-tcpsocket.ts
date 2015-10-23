/// <reference path='../../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../../third_party/typings/freedom/freedom.d.ts' />

import MockEventHandler = require('./mock-eventhandler');

function makeMockVoidMethod0<T>(): freedom.Method0<void> {
  var f: any = (x: T) => {
    return Promise.resolve<void>();
  };
  f.reckless = (x: T) => { };
  return f;
}

function makeMockWrite<T>(): freedom.Method1<ArrayBuffer, freedom.TcpSocket.WriteInfo> {
  var f: any = (x: ArrayBuffer) => {
    return Promise.resolve<freedom.TcpSocket.WriteInfo>(null);
  };
  f.reckless = (x: ArrayBuffer) => { };
  return f;
}

class MockFreedomTcpSocket extends MockEventHandler
    implements freedom.TcpSocket.Socket {
  constructor() {
    super(['onConnection', 'onDisconnect', 'onData']);
  }

  public listen = (address: string, port: number): Promise<void> => {
    return Promise.resolve(null);
  }

  public connect = (hostname: string, port: number): Promise<void> => {
    return Promise.resolve(null);
  }

  public secure = (): Promise<void> => {
    return Promise.resolve(null);
  }

  public getInfo = (): Promise<freedom.TcpSocket.SocketInfo> => {
    return Promise.resolve(null);
  };

  public close = (): Promise<void> => {
    return Promise.resolve(null);
  };

  public write = makeMockWrite();

  public pause = makeMockVoidMethod0();

  public resume = makeMockVoidMethod0();
}

export = MockFreedomTcpSocket;
