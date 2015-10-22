/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import freedomMocker = require('../freedom/mocks/mock-freedom-in-module-env');
import getter = require('./getter');
import MockFreedomEventHandler = require('../freedom/mocks/mock-eventhandler');
import net = require('../net/net.types');

// freedom = freedomMocker.makeMockFreedomInModuleEnv();

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
    var myGetter = new getter.Getter(mockServerSocket as any as freedom.TcpSocket.Socket, sampleEndpoint, 'yoyoyo');

    // mockServerSocket.handleEvent('onConnection', <freedom.TcpSocket.ConnectInfo>{
    //   host: '127.0.0.1',
    //   port: '55000',
    //   socket: 1
    // });
  });
});
