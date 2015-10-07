/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import logging = require('../logging/logging');
import loggingTypes = require('../loggingprovider/loggingprovider.types');
import peerconnection = require('../webrtc/peerconnection');
import signals = require('../webrtc/signals');

var loggingController = freedom['loggingcontroller']();
loggingController.setDefaultFilter(loggingTypes.Destination.console,
                                   loggingTypes.Level.debug);

var log :logging.Log = new logging.Log('copypaste chat');

var parentFreedomModule = freedom();

var config :freedom.RTCPeerConnection.RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302'
      ]
    }
  ]
};

var pc = peerconnection.createPeerConnection(config);

// Forward signalling channel messages to the UI.
pc.signalForPeerQueue.setSyncHandler((message:signals.Message) => {
  parentFreedomModule.emit('signalForPeer', JSON.stringify(message));
});

// Receive signalling channel messages from the UI.
parentFreedomModule.on('handleSignalMessage', (message:string) => {
  try {
    var decodedMessage = JSON.parse(message);
    pc.handleSignalMessage(decodedMessage);
  } catch (e) {
    log.warn('error parsing signal: %1', message);
  }
});

export var connectDataChannel = (channel:peerconnection.DataChannel) => {
  log.info('datachannel open!');
  // Send messages over the datachannel in response to events from the UI.
  parentFreedomModule.on('send', (message:string) => {
    channel.send({
      str: message
    }).catch((e:Error) => {
      log.error('error sending message: %1', e.message);
    });
  });
  // Forward messages received on the datachannel to the UI.
  channel.dataFromPeerQueue.setSyncHandler((d:peerconnection.Data) => {
    if (d.str === undefined) {
      log.error('only text messages are supported');
      return;
    }
    parentFreedomModule.emit('receive', d.str);
  });
  parentFreedomModule.emit('ready', {});
};

// Negotiate a peerconnection when the UI tells us to.
// This runs on the initiating peer's (getter's) side.
parentFreedomModule.on('start', () => {
  pc.negotiateConnection().then(() => {
    return pc.openDataChannel('text').then(
        (channel:peerconnection.DataChannel) => {
      connectDataChannel(channel);
    });
  }, (e:Error) => {
    log.error('could not establish connection: %1', e.message);
    parentFreedomModule.emit('error', {});
  });
});

// This fires on the non-initiating peer's (giver's) side.
pc.peerOpenedChannelQueue.setSyncHandler(
    (channel:peerconnection.DataChannel) => {
  connectDataChannel(channel);
});

pc.onceConnected.then(() => {
  log.info('peerconnection established!');
});
