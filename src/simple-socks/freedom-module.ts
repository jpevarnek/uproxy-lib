/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import getter = require('../socks/getter');
import giver = require('../socks/giver');
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

getter.fromEndpoint(socksEndpoint, 'getter').then((myGetter:getter.Getter) => {
  const myGiver = new giver.Giver('giver');

  myGiver.setGetter(myGetter);
  myGetter.setGiver(myGiver);

  log.info('SOCKS server listening on %1', socksEndpoint);
  log.info('curl -x socks5h://%1:%2 www.example.com',
      socksEndpoint.address, socksEndpoint.port);
}, (e:Error) => {
  log.error('failed to start getter: %1', e.message);
});
