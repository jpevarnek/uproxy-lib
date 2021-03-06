/// <reference path='../../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../../third_party/typings/freedom/freedom-module-env.d.ts' />
/// <reference path='../../../../third_party/typings/node/node.d.ts' />
/// <reference path='../../../../third_party/typings/ssh2/ssh2.d.ts' />

import arraybuffers = require('../../arraybuffers/arraybuffers');
import linefeeder = require('../../net/linefeeder');
import logging = require('../../logging/logging');
import queue = require('../../handler/queue');

// https://github.com/borisyankov/DefinitelyTyped/blob/master/ssh2/ssh2-tests.ts
import * as ssh2 from 'ssh2';
var Client = require('ssh2').Client;

var log: logging.Log = new logging.Log('cloud social');

const SSH_SERVER_PORT = 5000;

const ZORK_HOST = 'zork';
const ZORK_PORT = 9000;

// Key under which our contacts are saved in storage.
const STORAGE_KEY = 'cloud-social-contacts';

// Admin users can issue invites.
const ADMIN_USERNAME = 'giver';
const REGULAR_USERNAME = 'getter';

// Credentials for accessing a cloud instance.
// The serialised, base64 form is distributed amongst users.
// TODO: add (private) keys, for key-based auth
interface Invite {
  // Hostname or IP of the cloud instance.
  // This is the host on which sshd is running, so it should
  // be directly accessible from the client.
  host?: string;
  // Username.
  user?: string;
  // Password.
  pass?: string;
  // Private key, base64-encoded.
  key?: string;
}

// Type of the object placed, in serialised form, in storage
// under STORAGE_KEY.
interface SavedContacts {
  // TODO: remove this, invites are now embedded in contacts.
  invites?: Invite[];
  contacts?: SavedContact[];
}

// A contact as saved to storage, consisting of the invite
// plus any data fetched from the server on login (effectively,
// this on-demand data is cached here).
interface SavedContact {
  invite?: Invite;
  description?: string;
}

// Returns a VersionedPeerMessage, as defined in interfaces/social.ts
// in the uProxy repo.
//
// type is a PeerMessageType value (also defined in that file) and
// payload is an arbitrary payload, e.g. an instance message.
// TODO: use typings from the uProxy repo
function makeVersionedPeerMessage(
    type:number,
    payload:Object) : any {
  return {
    type: type,
    data: payload,
    // TODO: remote-instance assumes client versions >= 5 can do PGP, yuck
    version: 4
  };
}

// Returns an InstanceHandshake, as defined in interfaces/social.ts
// in the uProxy repo.
//
// publicKey is deliberately omitted so that uProxy will consider us
// an older client without PGP support and will avoid encrypting
// signalling messages (unnecessary because we are forwarding all the
// messages over an SSH tunnel).
// TODO: use typings from the uProxy repo
function makeInstanceMessage(address:string, description?:string): any {
  return {
    instanceId: address,
    // Shown in the contacts list while the user's list item is expanded
    description: description,
    consent: {
      isRequesting: false,
      isOffering: true
    },
    name: address,
    userId: address
  };
}

// To see how these fields are handled, see
// generic_core/social.ts#handleClient in the uProxy repo.
function makeClientState(address: string): freedom.Social.ClientState {
  return {
    userId: address,
    clientId: address,
    // https://github.com/freedomjs/freedom/blob/master/interface/social.json
    status: 'ONLINE',
    timestamp: Date.now()
  };
}

// To see how these fields are handled, see
// generic_core/social.ts#handleUserProfile in the uProxy repo. We omit
// the status field since remote-user.ts#update will use FRIEND as a default.
function makeUserProfile(address: string): freedom.Social.UserProfile {
  return {
    userId: address,
    name: address
  };
}

// Exposes Zork instances as friends.
//
// Intended for use with the run_cloud.sh script in the uproxy-docker
// repo, which will spin up the expected configuration:
//  - an SSH server running on port 5000, with an account named
//    "giver" having the password "giver"
//  - a Zork instance, accessible from the SSH server at the
//    hostname "zork"
//
// Note that since there's no actual uProxy instance running on the
// cloud instance, we are forced to re-implement some of uProxy's
// social code here, namely:
//  - we must send a "fake" INSTANCE message in order for uProxy
//    to consider the cloud instance online
//  - we have to inspect, wrap, and unwrap messages coming back and
//    forth since Zork has its own protocol
//
// Additionally, contacts are saved to storage so that we can contact
// them on login and emit a fake instance message for them, making
// them appear online.
//
// TODO: key-based authentication
// TODO: move the social message parsing stuff into Zork
export class CloudSocialProvider {
  private storage_: freedom.Storage.Storage = freedom['core.storage']();

  // Saved contacts, keyed by host.
  private savedContacts_: { [host: string]: SavedContact } = {};

  // SSH connections, keyed by host.
  private clients_: { [host: string]: Promise<Connection> } = {};

  constructor(private dispatchEvent_: (name: string, args: Object) => void) { }

  // Emits the messages necessary to make the user appear online 
  // in the contacts list.
  private notifyOfUser_ = (address: string, description?: string) => {
    this.dispatchEvent_('onUserProfile', makeUserProfile(address));

    var clientState = makeClientState(address);
    this.dispatchEvent_('onClientState', clientState);

    // Pretend that we received a message from a remote uProxy client.
    this.dispatchEvent_('onMessage', {
      from: clientState,
      // INSTANCE
      message: JSON.stringify(makeVersionedPeerMessage(
        3000, makeInstanceMessage(address, description)))
    });
  }

  // Establishes an SSH connection to a server, first shutting down
  // any that previously exists. Also emits an instance message,
  // allowing fields such as the description be updated on every
  // reconnect, and saves the contact to storage.
  private reconnect_ = (invite: Invite): Promise<Connection> => {
    log.debug('reconnecting to %1', invite.host);
    if (invite.host in this.clients_) {
      log.debug('closing old connection to %1', invite.host);
      this.clients_[invite.host].then((connection: Connection) => {
        connection.close();
      });
    }

    var connection = new Connection(invite, (message: Object) => {
      this.dispatchEvent_('onMessage', {
        from: makeClientState(invite.host),
        // SIGNAL_FROM_SERVER_PEER,
        message: JSON.stringify(makeVersionedPeerMessage(3002, message))
      });
    });

    this.clients_[invite.host] = connection.connect().then(() => {
      log.info('connected to zork on %1', invite.host);

      // Fetch the banner, if available, then emit an instance message.
      connection.getBanner().then((banner: string) => {
        if (banner.length < 1) {
          log.debug('empty banner, leaving blank');
        }
        return banner;
      }, (e: Error) => {
        log.warn('failed to fetch banner: %1', e);
        return '';
      }).then((banner: string) => {
        this.notifyOfUser_(invite.host, banner);
        this.savedContacts_[invite.host] = {
          invite: invite,
          description: banner
        };
        this.saveContacts_();
      });

      return connection;
    });

    return this.clients_[invite.host];
  }

  // Loads contacts from storage and emits an instance message for each.
  // This makes all of the stored contacts appear online.
  private loadContacts_ = () => {
    log.debug('loadContacts');
    this.savedContacts_ = {};
    this.storage_.get(STORAGE_KEY).then((storedString: string) => {
      if (!storedString) {
        log.debug('no saved contacts');
        return;
      }
      log.debug('loaded contacts: %1', storedString);
      try {
        var savedContacts: SavedContacts = JSON.parse(storedString);
        if (savedContacts.contacts) {
          for (let contact of savedContacts.contacts) {
            this.savedContacts_[contact.invite.host] = contact;
            this.notifyOfUser_(contact.invite.host, contact.description);
          }
        }
      } catch (e) {
        log.error('could not parse saved contacts: %1', e.message);
      }
    }, (e: Error) => {
      log.error('could not load contacts: %1', e);
    });
  }

  // Saves contacts to storage.
  private saveContacts_ = () => {
    log.debug('saveContacts');
    this.storage_.set(STORAGE_KEY, JSON.stringify(<SavedContacts>{
      contacts: Object.keys(this.savedContacts_).map(key => this.savedContacts_[key])
    })).then((unused: string) => {
      log.debug('saved contacts');
    }, (e: Error) => {
      log.error('could not save contacts: %1', e);
    });
  }

  public login = (options: freedom.Social.LoginRequest):
      Promise<freedom.Social.ClientState> => {
    log.debug('login: %1', options);
    this.loadContacts_();
    // TODO: emit an onUserProfile event, which can include an image URL
    // TODO: base this on the user's public key?
    //       (shown in the "connected accounts" page)
    return Promise.resolve(makeClientState('me'));
  }

  public sendMessage = (destinationClientId: string, message: string): Promise<void> => {
    log.debug('sendMessage to %1: %2', destinationClientId, message);
    try {
      // Messages are serialised VersionedPeerMessages. We need to extract
      // the signalling message, which is all Zork understands.
      var versionedPeerMessage: any = JSON.parse(message);
      if (versionedPeerMessage.type &&
          versionedPeerMessage.type === 3001 && // social.PeerMessageType.SIGNAL_FROM_CLIENT_PEER
          versionedPeerMessage.data) {
        // payload is either an instance of social.ts#SignallingMetadata
        // or is an opaque object we should forward to Zork.
        var payload = versionedPeerMessage.data;
        if (payload.proxyingId) {
          // Reset the SSH connection because Zork only supports one
          // proxyng session per connection.
          // TODO: Do not reconnect if we have just invited
          //       the instance (safe because all we've done is run ping).
          log.info('new proxying session %1', payload.proxyingId);
          if (!(destinationClientId in this.savedContacts_)) {
            return Promise.reject(new Error('unknown client ' + destinationClientId));
          }
          return this.reconnect_(this.savedContacts_[destinationClientId].invite).then(
              (connection: Connection) => {
            connection.sendMessage('give');
          });
        } else {
          if (destinationClientId in this.clients_) {
            return this.clients_[destinationClientId].then(
                (connection: Connection) => {
              connection.sendMessage(JSON.stringify(payload));
            });
          } else {
            return Promise.reject(new Error('unknown client ' + destinationClientId));
          }
        }
      } else {
        return Promise.reject(new Error('message has no or wrong type field'));
      }
    } catch (e) {
      return Promise.reject(new Error('could not de-serialise message: ' + e.message));
    }
  }

  public clearCachedCredentials = (): Promise<void> => {
    return Promise.reject(
        new Error('clearCachedCredentials unimplemented'));
  }

  public getUsers = (): Promise<freedom.Social.Users> => {
    return Promise.reject(
        new Error('getUsers unimplemented'));
  }

  public getClients = (): Promise<freedom.Social.Clients> => {
    return Promise.reject(
        new Error('getClients unimplemented'));
  }

  public logout = (): Promise<void> => {
    log.debug('logout');
    for (let address in this.clients_) {
      this.clients_[address].then((connection: Connection) => {
        connection.close();
      });
    }
    return Promise.resolve<void>();
  }

  ////
  // social2
  ////

  // Returns a new invite code for the specified server.
  // Rejects if the user is not logged in as an admin or there
  // is any error executing the command.
  // TODO: typings for invite codes
  public inviteUser = (clientId: string): Promise<Object> => {
    log.debug('inviteUser');
    if (!(clientId in this.clients_)) {
      return Promise.reject(new Error('unknown client ' + clientId));
    }
    if (this.savedContacts_[clientId].invite.user !== ADMIN_USERNAME) {
      return Promise.reject(new Error('user is logged in as non-admin user ' +
          this.savedContacts_[clientId].invite.user));
    }
    return this.clients_[clientId].then((connection: Connection) => {
      return connection.issueInvite();
    });
  }

  // Parses an invite code, received from uProxy in JSON format.
  // This is the networkData field of the invite codes distributed
  // to uProxy users.
  public acceptUserInvitation = (inviteJson: string): Promise<void> => {
    log.debug('acceptUserInvitation');
    try {
      var invite = <Invite>JSON.parse(inviteJson);
      return this.reconnect_(invite).then((connection: Connection) => {
        // Return nothing for type checking purposes.
      });
    } catch (e) {
      return Promise.reject(new Error('could not parse invite code: ' + e.message));
    }
  }

  public blockUser = (userId: string): Promise<void> => {
    return Promise.reject(
        new Error('blockUser unimplemented'));
  }

  public removeUser = (userId: string): Promise<void> => {
    return Promise.reject(
        new Error('removeUser unimplemented'));
  }
}

enum ConnectionState {
  NEW,
  CONNECTING,
  ESTABLISHING_TUNNEL,
  WAITING_FOR_PING,
  ESTABLISHED,
  TERMINATED
}

class Connection {
  private static COMMAND_DELIMITER = arraybuffers.decodeByte(
      arraybuffers.stringToArrayBuffer('\n'));

  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private state_ = ConnectionState.NEW;

  private client_ = new Client();

  // The tunneled connection, i.e. secure link to Zork.
  private stream_ :ssh2.Channel;

  constructor(
      private invite_: Invite,
      private received_: (message:Object) => void,
      private name_: string = 'tunnel' + Connection.id_++) {}

  // TODO: timeout
  public connect = (): Promise<void> => {
    if (this.state_ !== ConnectionState.NEW) {
      return Promise.reject(new Error('can only connect in NEW state'));
    }
    this.state_ = ConnectionState.CONNECTING;

    let connectConfig: ssh2.ConnectConfig = {
      host: this.invite_.host,
      port: SSH_SERVER_PORT,
      username: this.invite_.user,
      // Remaining fields only for type-correctness.
      tryKeyboard: false,
      debug: undefined
    };

    if (this.invite_.key) {
      connectConfig['privateKey'] = new Buffer(this.invite_.key, 'base64');
    } else {
      log.warn('using password-based auth, support will be removed soon!');
      connectConfig['password'] = this.invite_.pass;
    }

    return new Promise<void>((F, R) => {
      this.client_.on('ready', () => {
        this.setState_(ConnectionState.ESTABLISHING_TUNNEL);
        this.client_.forwardOut(
          // TODO: since we communicate using the stream, what does this mean?
          '127.0.0.1', 0,
          ZORK_HOST, ZORK_PORT, (e: Error, stream: ssh2.Channel) => {
            if (e) {
              this.close();
              R(new Error('error establishing tunnel: ' + e.toString()));
              return;
            }
            this.setState_(ConnectionState.WAITING_FOR_PING);

            this.stream_ = stream;

            var bufferQueue = new queue.Queue<ArrayBuffer, void>();
            new linefeeder.LineFeeder(bufferQueue).setSyncHandler((reply: string) => {
              log.debug('%1: received message: %2', this.name_, reply);
              switch (this.state_) {
                case ConnectionState.WAITING_FOR_PING:
                  if (reply === 'ping') {
                    this.setState_(ConnectionState.ESTABLISHED);
                    F();
                  } else {
                    this.close();
                    R(new Error('did not receive ping from server on login: ' +
                      reply));
                  }
                  break;
                case ConnectionState.ESTABLISHED:
                  try {
                    this.received_(JSON.parse(reply));
                  } catch (e) {
                    log.warn('%1: could not de-serialise signalling message: %2',
                      this.invite_, reply);
                  }
                  break;
                default:
                  log.warn('%1: did not expect message in state %2: %3',
                    this.name_, ConnectionState[this.state_], reply);
                  this.close();
              }
            });

            // TODO: add error handler for stream
            stream.on('data', (buffer: Buffer) => {
              bufferQueue.handle(arraybuffers.bufferToArrayBuffer(buffer));
            }).on('error', (e: Error) => {
              // This occurs when:
              //  - host cannot be reached, e.g. non-existant hostname
              // TODO: does this occur outside of startup, i.e. should it always reject?
              log.warn('%1: tunnel error: %2', this.name_, e);
              this.close();
              R(new Error('could not establish tunnel: ' + e.toString()));
            }).on('end', () => {
              // Occurs when the stream is "over" for any reason, including
              // failed connection.
              log.debug('%1: tunnel end', this.name_);
              this.close();
            }).on('close', (hadError: boolean) => {
              // TODO: when does this occur? don't see it on normal close or failure
              log.debug('%1: tunnel close: %2', this.name_, hadError);
              this.close();
            });

            stream.write('ping\n');
          });
      }).on('error', (e: Error) => {
        // This occurs when:
        //  - user supplies the wrong username or password
        //  - host cannot be reached, e.g. non-existant hostname
        // TODO: does this occur outside of startup, i.e. should it always reject?
        log.warn('%1: connection error: %2', this.name_, e);
        this.close();
        R(new Error('could not login: ' + e.toString()));
      }).on('end', () => {
        // Occurs when the connection is "over" for any reason, including
        // failed connection.
        log.debug('%1: connection ended', this.name_);
        this.close();
      }).on('close', (hadError: boolean) => {
        // TODO: when does this occur? don't see it on normal close or failure
        log.debug('%1: connection close: %2', this.name_, hadError);
        this.close();
      }).connect(connectConfig);
    });
  }

  public sendMessage = (s: string): void => {
    if (this.state_ !== ConnectionState.ESTABLISHED) {
      throw new Error('can only connect in ESTABLISHED state');
    }
    this.stream_.write(s + '\n');
  }

  public close = (): void => {
    log.debug('%1: close', this.name_);
    if (this.state_ === ConnectionState.TERMINATED) {
      log.debug('%1: already closed', this.name_);
    } else {
      this.setState_(ConnectionState.TERMINATED);
      this.client_.end();
      // TODO: what about the stream?
    }
  }

  // Fetches the server's description, i.e. /banner.
  public getBanner = (): Promise<string> => {
    return this.exec_('cat /banner');
  }

  // Returns a base64-decoded, deserialised invite code.
  public issueInvite = (): Promise<Object> => {
    return this.exec_('sudo /issue_invite.sh').then((inviteCode: string) => {
      return JSON.parse(new Buffer(inviteCode, 'base64').toString());
    });
  }

  // Executes a command, fulfilling with the command's stdout
  // or rejecting if output is received on stderr.
  private exec_ = (command:string): Promise<string> => {
    if (this.state_ !== ConnectionState.ESTABLISHED) {
      return Promise.reject(new Error('can only execute commands in ESTABLISHED state'));
    }
    return new Promise<string>((F, R) => {
      this.client_.exec(command, (e: Error, stream: ssh2.Channel) => {
        if (e) {
          R(e);
          return;
        }
        stream.on('data', function(data: Buffer) {
          F(data.toString());
        }).stderr.on('data', function(data: Buffer) {
          R(new Error(data.toString()));
        }).on('close', function(code: any, signal: any) {
          log.debug('exec stream closed');
        });
      });
    });
  }

  private setState_ = (newState: ConnectionState) => {
    log.debug('%1: %2 -> %3', this.name_, ConnectionState[this.state_],
      ConnectionState[newState]);
    this.state_ = newState;
  }

  public getState = (): ConnectionState => {
    return this.state_;
  }
}
