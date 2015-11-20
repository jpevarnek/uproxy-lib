/// <reference path='../../../third_party/uTransformers/utransformers.d.ts' />
/// <reference path='../../../third_party/simple-rc4/simple-rc4.d.ts' />
/// <reference path='../../../third_party/typings/node/node.d.ts' />

import RC4 = require('simple-rc4');
import arraybuffers = require('../arraybuffers/arraybuffers');
import logging = require('../logging/logging');

var log :logging.Log = new logging.Log('encryption shaper');

// Accepted in serialised form by configure().
export interface RC4Config {
  key:string
}

// Creates a sample (non-random) config, suitable for testing.
const SAMPLE_KEY_SIZE = 16;
export var sampleConfig = () : RC4Config => {
  var bytes = new Uint8Array(SAMPLE_KEY_SIZE); // all zeroes
  var hex = arraybuffers.arrayBufferToHexString(bytes.buffer);
  return {
    key: hex
  };
}

// A packet shaper that encrypts the packets with RC4.
export class RC4Shaper implements Transformer {
  private key_ :Buffer;

  public constructor() {
    this.configure(JSON.stringify(sampleConfig()));
  }

  // This method is required to implement the Transformer API.
  // @param {ArrayBuffer} key Key to set, not used by this class.
  public setKey = (key:ArrayBuffer) :void => {
    throw new Error('setKey unimplemented');
  }

  public configure = (json:string) :void => {
    try {
      let config = <RC4Config>JSON.parse(json);
      if (config.key === undefined) {
        throw new Error("must set key parameter");
      }
      this.key_ = arraybuffers.arrayBufferToBuffer(
          arraybuffers.hexStringToArrayBuffer(config.key));
    } catch (e) {
      throw new Error('could not parse config: ' + e.message);
    }
  }

  // TODO: Investigate the fastest way to convert between Buffer
  //       and ArrayBuffer on Chrome and Firefox.
  public process_ = (arrayBuffer: ArrayBuffer): ArrayBuffer[] => {
    let buffer = arraybuffers.arrayBufferToBuffer(arrayBuffer);
    let encoder = new RC4(this.key_);
    encoder.update(buffer);
    return [arraybuffers.bufferToArrayBuffer(buffer)];
  }

  public transform = (buffer:ArrayBuffer) :ArrayBuffer[] => {
    return this.process_(buffer);
  }

  public restore = (buffer:ArrayBuffer) :ArrayBuffer[] => {
    return this.process_(buffer);
  }

  // No-op (we have no state or any resources to dispose).
  public dispose = () :void => {}
}
