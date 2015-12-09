/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import SocksSession = require('../socks/session');
import FreedomSocksServer = require('../socks/freedom/server');
import FreedomSocksSession = require('../socks/freedom/session');

import logging = require('../logging/logging');
import loggingTypes = require('../loggingprovider/loggingprovider.types');
import net = require('../net/net.types');

const loggingController = freedom['loggingcontroller']();
loggingController.setDefaultFilter(loggingTypes.Destination.console,
                                   loggingTypes.Level.debug);

const log :logging.Log = new logging.Log('simple-socks');

const socksEndpoint: net.Endpoint = {
  address: '0.0.0.0',
  port: 9999
};

// 100% freedomjs-based SOCKS server, with direct function calls
// between the server and sessions.
let numSessions = 0;
var server = new FreedomSocksServer(socksEndpoint, (session:SocksSession) => {
  let clientId = 'p' + (numSessions++) + 'p';
  log.info('new client %1', clientId);
  return new FreedomSocksSession(
    'sample',
    clientId,
    session.onRemoteData,
    session.onRemoteDisconnect);
});
server.listen().then(() => {
  log.info('SOCKS server listening on %1', socksEndpoint);
  log.info('curl -x socks5h://%1:%2 www.example.com',
      socksEndpoint.address, socksEndpoint.port);
}, (e:Error) => {
  log.error('failed to start SOCKS server: %1', e.message);
});
