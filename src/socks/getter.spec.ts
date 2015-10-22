/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import freedomMocker = require('../freedom/mocks/mock-freedom-in-module-env');
// TODO: why oh why does this need to be here???
freedom = freedomMocker.makeMockFreedomInModuleEnv();

import getter = require('./getter');
import middle = require('./middle');
import MockFreedomEventHandler = require('../freedom/mocks/mock-eventhandler');
import net = require('../net/net.types');

var sampleEndpoint :net.Endpoint = {
  address: '127.0.0.1',
  port: 9999
};

describe('getter', function() {
  var mockServerSocket: MockFreedomEventHandler;
  var mockClientSocket: MockFreedomEventHandler;

  beforeEach(function() {
    mockServerSocket = new MockFreedomEventHandler(['onConnection', 'onDisconnect']);
    mockClientSocket = new MockFreedomEventHandler(['onData', 'onDisconnect']);
  });

  it('notifies giver of new connections', (done) => {
    freedom = freedomMocker.makeMockFreedomInModuleEnv({
      'core.tcpsocket': () => { return mockClientSocket; }
    });

    var myGetter = new getter.Getter(
          mockServerSocket as any as freedom.TcpSocket.Socket,
          sampleEndpoint);

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

  it('notifies giver of disconnection', (done) => {
    freedom = freedomMocker.makeMockFreedomInModuleEnv({
      'core.tcpsocket': () => { return mockClientSocket; }
    });

    var myGetter = new getter.Getter(
        mockServerSocket as any as freedom.TcpSocket.Socket,
        sampleEndpoint);

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

  // TODO: check we do not notify the giver of disconnection when *it* has already informed us
});
