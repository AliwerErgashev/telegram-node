const EventEmitter = require('events');
const tl = require('telegram-tl-node');
const mt = require('telegram-mt-node');
const logger = require('get-log')('telegram-node');
const apiTlSchema = require('./api-tlschema.json');

const NULL_SERVER_SALT = '0x0000000000000000';

const publicKeys = [
  {
    fingerprint: '0x9a996a1db11c729b',
    modulus: 'c6aeda78b02a251db4b6441031f467fa871faed32526c436524b1fb3b5dca28efb8c089dd1b46d92c895993d87108254951c5f001a0f055f3063dcd14d431a300eb9e29517e359a1c9537e5e87ab1b116faecf5d17546ebc21db234d9d336a693efcb2b6fbcca1e7d1a0be414dca408a11609b9c4269a920b09fed1f9a1597be02761430f09e4bc48fcafbe289054c99dba51b6b5eb7d9c3a2ab4e490545b4676bd620e93804bcac93bf94f73f92c729ca899477ff17625ef14a934d51dc11d5f8650a3364586b3a52fcff2fedec8a8406cac4e751705a472e55707e3c8cd5594342b119c6c3293532d85dbe9271ed54a2fd18b4dc79c04a30951107d5639397',
    exponent: '010001'
  },
  {
    fingerprint: '0xb05b2a6f70cdea78',
    key: 'b1066749655935f0a5936f517034c943bea7f3365a8931ae52c8bcb14856f004b83d26cf2839be0f22607470d67481771c1ce5ec31de16b20bbaa4ecd2f7d2ecf6b6356f27501c226984263edc046b89fb6d3981546b01d7bd34fedcfcc1058e2d494bda732ff813e50e1c6ae249890b225f82b22b1e55fcb063dc3c0e18e91c28d0c4aa627dec8353eee6038a95a4fd1ca984eb09f94aeb7a2220635a8ceb450ea7e61d915cdb4eecedaa083aa3801daf071855ec1fb38516cb6c2996d2d60c0ecbcfa57e4cf1fb0ed39b2f37e94ab4202ecf595e167b3ca62669a6da520859fb6d6c6203dfdfc79c75ec3ee97da8774b2da903e3435f2cd294670a75a526c1',
    exponent: '010001'
  },
  {
    fingerprint: '0xc3b42b026ce86b21',
    modulus: 'c150023e2f70db7985ded064759cfecf0af328e69a41daf4d6f01b538135a6f91f8f8b2a0ec9ba9720ce352efcf6c5680ffc424bd634864902de0b4bd6d49f4e580230e3ae97d95c8b19442b3c0a10d8f5633fecedd6926a7f6dab0ddb7d457f9ea81b8465fcd6fffeed114011df91c059caedaf97625f6c96ecc74725556934ef781d866b34f011fce4d835a090196e9a5f0e4449af7eb697ddb9076494ca5f81104a305b6dd27665722c46b60e5df680fb16b210607ef217652e60236c255f6a28315f4083a96791d7214bf64c1df4fd0db1944fb26a2a57031b32eee64ad15a8ba68885cde74a5bfc920f6abf59ba5c75506373e7130f9042da922179251f',
    exponent: '010001'
  },
  {
    fingerprint: '0x71e025b6c76033e3',
    modulus: 'c2a8c55b4a62e2b78a19b91cf692bcdc4ba7c23fe4d06f194e2a0c30f6d9996f7d1a2bcc89bc1ac4333d44359a6c433252d1a8402d9970378b5912b75bc8cc3fa76710a025bcb9032df0b87d7607cc53b928712a174ea2a80a8176623588119d42ffce40205c6d72160860d8d80b22a8b8651907cf388effbef29cd7cf2b4eb8a872052da1351cfe7fec214ce48304ea472bd66329d60115b3420d08f6894b0410b6ab9450249967617670c932f7cbdb5d6fbcce1e492c595f483109999b2661fcdeec31b196429b7834c7211a93c6789d9ee601c18c39e521fda9d7264e61e518add6f0712d2d5228204b851e13c4f322e5c5431c3b7f31089668486aadc59f',
    exponent: '010001'
  }
];
publicKeys.forEach((publicKey) => mt.security.PublicKey.addKey(publicKey));

const type = {_id: 'api.type'};
tl.TypeBuilder.buildTypes(apiTlSchema.constructors, null, type);

const service = {_id: 'api.service'};
tl.TypeBuilder.buildTypes(apiTlSchema.methods, null, service, true);

const api = {type, service};

function createEventEmitterCallback(event, emitter) {
  return function (ex) {
    if (ex) {
      emitter.emit('error', ex);
    } else {
      const args = Array.prototype.slice.call(arguments);
      args[0] = event;
      emitter.emit.apply(emitter, args);
      if (event == 'end') {
        emitter.removeAllListeners();
      }
    }
  };
}

function callService(service, emitter, channel, callback) {
  const argsValue = Array.prototype.slice.call(Array.prototype.slice.call(arguments)[4]);
  const callerFunc = arguments.callee.caller;
  const eventName = service.name || service._name;
  const callerArgNames = _retrieveArgumentNames(callerFunc);
  const props = {};
  for (let i = 0; i < callerArgNames.length - 1; i++) {
    props[callerArgNames[i]] = argsValue[i];
  }
  if (callback) {
    emitter.once(eventName, callback);
  }
  if (emitter.isReady(true)) {
    try {
      service({
        props: props,
        channel: channel,
        callback: createEventEmitterCallback(eventName, emitter)
      });
    } catch (err) {
      emitter.emit('error', err);
    }
  }
  return new Promise(function (fulfill, reject) {
    emitter.once('error', reject);
    emitter.once(eventName, function (result) {
      emitter.removeListener('error', reject);
      if (typeof result !== 'boolean' && result.instanceOf('mtproto.type.Rpc_error')) {
        reject(new Error(result.error_message));
      } else {
        fulfill(result);
      }
    });
  });
}

function _retrieveArgumentNames(func) {
  const found = /^[\s\(]*function[^(]*\(\s*([^)]*?)\s*\)/.exec(func.toString());
  return found && found[1] ? found[1].split(/,\s*/) : [];
}

class Account {
  constructor(client) {
    this.client = client;
  }

  updateStatus(offline, callback) {
    offline = offline === false ? new api.type.BoolFalse() :
      ( offline === true ? new api.type.BoolTrue() : offline);
    return callService(api.service.account.updateStatus, this.client, this.client._channel, callback, arguments);
  }
}

class Auth {
  constructor(client) {
    this.client = client;
  }

  sendCode(phone_number, sms_type, lang_code, callback) {
    api.service.auth.sendCode({
      channel: this.client._channel,
      props: {
        api_id: this.client._app.id,
        api_hash: this.client._app.hash,
        phone_number,
        sms_type,
        lang_code
      },
      callback
    });
  }

  sendCall(phone_number, phone_code_hash, callback) {
    return callService(api.service.auth.sendCall, this.client, this.client._channel, callback, arguments);
  }

  signIn(phone_number, phone_code_hash, phone_code, callback) {
    return callService(api.service.auth.signIn, this.client, this.client._channel, callback, arguments);
  }

  signUp(phone_number, phone_code_hash, phone_code, first_name, last_name, callback) {
    return callService(api.service.auth.signUp, this.client, this.client._channel, callback, arguments);
  }

  checkPhone(phone_number, callback) {
    return callService(api.service.auth.checkPhone, this.client, this.client._channel, callback, arguments);
  }
}

class Contacts {
  constructor(client) {
    this.client = client;
  }

  getContacts(hash, callback) {
    return callService(api.service.contacts.getContacts, this.client, this.client._channel, callback, arguments);
  }
}

class Help {
  constructor(client) {
    this.client = client;
  }

  getConfig(callback) {
    api.service.help.getConfig({
      channel: this.client._channel,
      props: {},
      callback
    });
  }

  getNearestDc(callback) {
    api.service.help.getNearestDc({
      channel: this.client._channel,
      props: {},
      callback
    });
  }

  getInviteText(lang_code, callback) {
    api.service.help.getInviteText({
      channel: this.client._channel,
      props: {
        lang_code
      },
      callback
    });
  }
}

class Messages {
  constructor(client) {
    this.client = client;
  }

  getDialogs(offset, max_id, limit, callback) {
    return callService(api.service.messages.getDialogs, this.client, this.client._channel, callback, arguments);
  }

  getHistory(peer, offset, max_id, limit, callback) {
    return callService(api.service.messages.getHistory, this.client, this.client._channel, callback, arguments);
  }

  readHistory(peer, max_id, offset, read_contents, callback) {
    read_contents = read_contents === false ? new api.type.BoolFalse() :
      ( read_contents === true ? new api.type.BoolTrue() : read_contents);
    return callService(api.service.messages.readHistory, this.client, this.client._channel, callback, arguments);
  }

  sendMessage(peer, message, random_id, callback) {
    return callService(api.service.messages.sendMessage, this.client, this.client._channel, callback, arguments);
  }
}

class Updates {
  constructor(client) {
    this.client = client;
  }

  getState(callback) {
    return callService(api.service.updates.getState, this.client, this.client._channel, callback, arguments);
  }

  getDifference(pts, date, qts, callback) {
    return callService(api.service.updates.getDifference, this.client, this.client._channel, callback, arguments);
  }
}

class Client extends EventEmitter {
  constructor(app, dataCenter) {
    super();
    this._app = app;

    if ('TCP' === app.connectionType) {
      this._connection = new mt.net.TcpConnection(dataCenter);
    } else {
      this._connection = new mt.net.HttpConnection(dataCenter);
    }

    if (app.authKey) {
      this._channel = this.createEncryptedChannel(app.authKey, NULL_SERVER_SALT);
    }

    this.account = new Account(this);
    this.auth = new Auth(this);
    this.contacts = new Contacts(this);
    this.help = new Help(this);
    this.messages = new Messages(this);
    this.updates = new Updates(this);
  }

  static retrieveAuthKey(authKeyBuffer, authKeyPassword) {
    return mt.auth.AuthKey.decryptAuthKey(authKeyBuffer, authKeyPassword);
  }

  createEncryptedChannel(authKey, serverSalt) {
    const context = {
      authKey: authKey,
      serverSalt: serverSalt,
      sessionId: mt.utility.createNonce(8),
      sequenceNumber: new mt.SequenceNumber()
    };
    return new mt.net.EncryptedRpcChannel(this._connection, context, this._app);
  }

  manageUpdatesListener(func, callback) {
    const emitter = this._channel.getParser();
    emitter[func]('api.type.UpdatesTooLong', callback);
    emitter[func]('api.type.UpdateShortMessage', callback);
    emitter[func]('api.type.UpdateShortChatMessage', callback);
    emitter[func]('api.type.UpdateShort', callback);
    emitter[func]('api.type.UpdatesCombined', callback);
    emitter[func]('api.type.Updates', callback);
  }

  connect(callback) {
    if (callback) {
      this.once('connect', callback);
    }
    this._connection.connect(createEventEmitterCallback('connect', this));
  }

  createAuthKey(callback) {
    if (callback) {
      this.once('authKeyCreate', function (auth) {
        this._channel = this.createEncryptedChannel(auth.key, auth.serverSalt);
        callback(auth);
      });
    }
    if (this._connection && this._connection.isConnected()) {
      mt.auth.createAuthKey(
        createEventEmitterCallback('authKeyCreate', this),
        new mt.net.RpcChannel(this._connection));
    } else {
      const msg = 'Client is not yet connected! Wait until it\'s connected before call this method!';
      logger.error(msg);
      this.emit('error', new Error(msg));
    }
  }

  getDataCenters(callback) {
    if (callback) {
      this.once('dataCenter', callback);
    }
    if (this.isReady(true)) {
      const self = this;
      try {
        api.service.help.getConfig({
          props: {},
          channel: self._channel,
          callback: function (ex, config) {
            if (ex) {
              self.emit('error', ex);
            } else {
              const dcs = {
                toPrintable: tl.utility.toPrintable
              };
              const dcList = config.dc_options.list;
              for (let i = 0; i < dcList.length; i++) {
                const dc = dcList[i];
                dcs['DC_' + dc.id] = {
                  host: dc.ip_address,
                  port: dc.port,
                  toPrintable: tl.utility.toPrintable
                };
              }
              api.service.help.getNearestDc({
                props: {},
                channel: self._channel,
                callback: function (ex, nearestDc) {
                  if (ex) {
                    logger.error('error: ', ex);
                    self.emit('error', ex);
                  } else {
                    dcs.current = 'DC_' + nearestDc.this_dc;
                    dcs.nearest = 'DC_' + nearestDc.nearest_dc;
                    self.emit('dataCenter', dcs);
                  }
                }
              });
            }
          }
        });
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  httpPoll(callback, maxWait, waitAfter, maxDelay) {
    if (callback) {
      this.once('httpPoll', callback);
    }
    if (this.isReady(true) && this._connection instanceof mt.net.HttpConnection) {
      const self = this;
      maxWait = maxWait || 3000;
      try {
        mt.service.http_wait({
          props: {
            max_delay: maxDelay || 0,
            wait_after: waitAfter || 0,
            max_wait: maxWait
          },
          channel: self._channel,
          callback: function (ex, result) {
            if (ex) {
              self.emit('error', ex);
            } else {
              self.emit('httpPoll', result);
              if (self._httpPollLoop) {
                self.httpPoll(callback, maxWait, waitAfter, maxDelay);
              }
            }
          }
        });
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  startHttpPollLoop(callback, maxWait, waitAfter, maxDelay) {
    this._httpPollLoop = true;
    this.httpPoll(callback, maxWait, waitAfter, maxDelay);
  }

  stopHttpPollLoop() {
    this._httpPollLoop = false;
  }

  registerOnUpdates(callback) {
    this.manageUpdatesListener('on', callback);
  }

  unregisterOnUpdates(callback) {
    this.manageUpdatesListener('removeListener', callback);
  }

  isReady(emitError) {
    let isReady = this._channel ? true : false;
    if (!isReady && emitError) {
      const msg = 'Client is not yet ready!';
      logger.error(msg);
      this.emit('error', new Error(msg));
    }
    return isReady;
  }

  end(callback) {
    if (callback) {
      this.once('end', callback);
    }
    this._connection.close(createEventEmitterCallback('end', this));
  }
}

exports.TEST_PRIMARY_DC = {
  host: "149.154.167.40",
  port: "443"
};
exports.PROD_PRIMARY_DC = {
  host: "149.154.167.50",
  port: "443"
};
exports.type = api.type;
exports.Client = Client;
