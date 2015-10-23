/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import freedomMocker = require('../freedom/mocks/mock-freedom-in-module-env');
// TODO: why oh why does this need to be here???
freedom = freedomMocker.makeMockFreedomInModuleEnv();

import getter = require('./getter');
import middle = require('./middle');
import MockFreedomEventHandler = require('../freedom/mocks/mock-eventhandler');
import MockFreedomTcpSocket = require('../freedom/mocks/mock-tcpsocket');
import net = require('../net/net.types');

var sampleEndpoint :net.Endpoint = {
  address: '127.0.0.1',
  port: 9999
};

describe('getter', function() {
  var mockServerSocket: MockFreedomTcpSocket;
  var mockClientSocket: MockFreedomTcpSocket;

  var myGetter: getter.Getter;

  beforeEach(function() {
    mockServerSocket = new MockFreedomTcpSocket();
    mockClientSocket = new MockFreedomTcpSocket();

    freedom = freedomMocker.makeMockFreedomInModuleEnv({
      'core.tcpsocket': () => { return mockClientSocket; }
    });

    myGetter = new getter.Getter(
      mockServerSocket as any as freedom.TcpSocket.Socket,
      sampleEndpoint);
  });

  it('notifies giver of new connections', (done) => {
    myGetter.setGiver(<middle.RemotePeer>{
      connected: (client:string) => {
        expect(client).toEqual('127.0.0.1:55000');
        done();
      },
      handle:  (client: string, buffer: ArrayBuffer) => {},
      disconnected: (client:string) => {}
    });

    mockServerSocket.handleEvent('onConnection', <freedom.TcpSocket.ConnectInfo>{
      host: '127.0.0.1',
      port: 55000,
      socket: 1
    });
  });

  // TODO: fail if getter calls close on the client connection
  it('notifies giver of disconnection', (done) => {
    myGetter.setGiver(<middle.RemotePeer>{
      connected: (client: string) => {
        mockClientSocket.handleEvent('onDisconnect', <freedom.TcpSocket.DisconnectInfo>{
          errcode: 'none',
          message: 'none'
        });
      },
      handle: (client: string, buffer: ArrayBuffer) => { },
      disconnected: (client: string) => {
        expect(client).toEqual('127.0.0.1:55000');
        done();
      }
    });

    mockServerSocket.handleEvent('onConnection', <freedom.TcpSocket.ConnectInfo>{
      host: '127.0.0.1',
      port: 55000,
      socket: 1
    });
  });

  // TODO: fail if getter notifies the giver of disconnection
  it('handles remote disconnection', (done) => {
    myGetter.setGiver(<middle.RemotePeer>{
      connected: (client: string) => {
        myGetter.disconnected(client);
      },
      handle: (client: string, buffer: ArrayBuffer) => {},
      disconnected: (client: string) => {}
    });

    var closeSpy = spyOn(mockClientSocket, 'close').and.callFake(done);

    mockServerSocket.handleEvent('onConnection', <freedom.TcpSocket.ConnectInfo>{
      host: '127.0.0.1',
      port: 55000,
      socket: 1
    });
  });
});
