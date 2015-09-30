/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import giver = require('./giver');
import logging = require('../logging/logging');
import net = require('../net/net.types');

const log :logging.Log = new logging.Log('getter');

////////
// Static constructors.
////////

export function fromEndpoint(
    endpoint:net.Endpoint,
    name?:string)
    :Promise<Getter> {
  var getter = new Getter(endpoint, name);
  return getter.listen().then(() => {
    return getter;
  });
}

////////
// The class itself.
////////

// The getter, i.e. TCP-speaking, side of the SOCKS proxy.
// TODO: extract an interface common to this and a WebRTC intermediary
export class Getter {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private socket_: freedom.TcpSocket.Socket = freedom['core.tcpsocket']();

  private giver_: giver.Giver;

  // Number of connections made so far, for logging purposes.
  private numConnections_ = 0;

  // Do not call this directly.
  // Use the static constructors instead.
  constructor(
      private requestedEndpoint_:net.Endpoint,
      private name_ :string = 'unnamed-getter-' + Getter.id_) {
    Getter.id_++;

    this.socket_.on('onConnection', this.onConnection_);
    this.socket_.on('onDisconnect', this.onDisconnect_);
  }

  // Do not call this directly.
  // Use the static constructors.
  public listen = () : Promise<void> => {
    return this.socket_.listen(
        this.requestedEndpoint_.address,
        this.requestedEndpoint_.port);
  }

  private onConnection_ = (
      connectInfo:freedom.TcpSocket.ConnectInfo) : void => {
    log.info('%1: new connection %2', this.name_, this.numConnections_++);
    var connection :freedom.TcpSocket.Socket =
        freedom['core.tcpsocket'](connectInfo.socket);

    var clientEndpoint: net.Endpoint = {
      address: connectInfo.host,
      port: connectInfo.port
    };

    connection.on('onData', (info: freedom.TcpSocket.ReadInfo) => {
      this.giver_.handle(clientEndpoint, info.data);
    });

    connection.on('onDisconnect', (info: freedom.TcpSocket.DisconnectInfo) => {
      log.info('%1: disconnected from %2', this.name_, clientEndpoint);
      this.giver_.disconnected(clientEndpoint);
    });
  }

  private onDisconnect_ = (info: freedom.TcpSocket.DisconnectInfo): void => {
    log.error('%1: server socket closed!', this.name_);
  }

  // TODO: figure out a way to remove this (it destroys immutability)
  public setGiver = (newGiver:giver.Giver) : void => {
    this.giver_ = newGiver;
  }
}
