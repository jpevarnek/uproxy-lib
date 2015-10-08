/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import logging = require('../logging/logging');
import middle = require('./middle');
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
export class Getter implements middle.RemotePeer {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private socket_: freedom.TcpSocket.Socket = freedom['core.tcpsocket']();

  private giver_: middle.RemotePeer;

  // Keyed by client ID.
  private connections_:{[id:string]:freedom.TcpSocket.Socket} = {};

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
    var clientId = connectInfo.host + ':' + connectInfo.port;
    log.info('%1: new connection from %2', this.name_, clientId);

    var connection :freedom.TcpSocket.Socket =
        freedom['core.tcpsocket'](connectInfo.socket);

    connection.on('onData', (info:freedom.TcpSocket.ReadInfo) => {
      this.giver_.handle(clientId, info.data);
    });

    connection.on('onDisconnect', (info:freedom.TcpSocket.DisconnectInfo) => {
      log.info('%1: disconnected from %2', this.name_, clientId);
      // TODO: does the order of these two statements matter?
      delete this.connections_[clientId];
      this.giver_.disconnected(clientId);
    });

    this.connections_[clientId] = connection;
  }

  public handle = (
      clientId:string,
      buffer:ArrayBuffer) => {
    if (clientId in this.connections_) {
      // TODO: be reckless
      this.connections_[clientId].write(buffer);
    } else {
      log.warn('%1: send for unknown client %2', this.name_, clientId);
    }
  }

  public disconnected = (clientId:string) => {
    log.debug('%1: disconnected from %2', this.name_, clientId);
    if (clientId in this.connections_) {
      this.connections_[clientId].close();
    } else {
      log.warn('%1: disconnection for unknown client %2', this.name_, clientId);
    }
  }

  private onDisconnect_ = (info:freedom.TcpSocket.DisconnectInfo): void => {
    log.error('%1: server socket closed!', this.name_);
  }

  // TODO: figure out a way to remove this (it destroys immutability)
  public setGiver = (newGiver:middle.RemotePeer) : void => {
    this.giver_ = newGiver;
  }
}
