
// TODO(bwiley): update uTransformers to be compatible with require
// TODO(ldixon): update to a require-style inclusion.
// e.g.
//  import Transformer = require('uproxy-obfuscators/transformer');
/// <reference path='../../../third_party/uTransformers/utransformers.d.ts' />

import logging = require('../logging/logging');

var log :logging.Log = new logging.Log('fancy-transformers');

// TODO(bwiley): Convert /* */ to // as specified in the style guide

/**
 * An obfuscator that only modifies packet length.
 * To start out, this is a very simple (and bad) packet length obfuscator.
 * It follows this logic:
 * Case 1 - buffer length + 2 == target: return length(buffer) + buffer
 * Case 2 - buffer length + 2 > target:  return length(target) + randomBytes(target)
 * Case 3 - buffer length + 2 < target:  return length(target) + buffer + randomBytes(target)
 */
class PacketLengthShaper implements Transformer {
  private fragmentation_ : boolean = false;

  public constructor() {
    log.info('Constructed packet length shaper');
  }

  /**
   * This method is required to implement the Transformer API.
   * @param {ArrayBuffer} key Key to set, not used by this class.
   */
  public setKey = (key:ArrayBuffer) : void => {
    /* Do nothing. */
  }

  /** Get the target length. */
  public configure = (json:string) : void => {
    var config=JSON.parse(json);
    // Optional parameter
    if('fragmentation' in config) {
      this.fragmentation_=config['fragmentation']
    } // Otherwise use default value.
  }

  public transform = (buffer:ArrayBuffer) : ArrayBuffer[] => {
//    log.info('Transforming');
    return this.shapePacketLength(buffer, buffer.byteLength+2);
  }

  public shapePacketLength = (buffer:ArrayBuffer, target:number) : ArrayBuffer[] => {
//    log.info('Transforming');
    if (buffer.byteLength + 2 == target) {
      log.info('case ==');
      return [this.append_(this.encodeLength_(buffer.byteLength), buffer)];
    } else if (buffer.byteLength + 2 > target) {
//      log.info('case > %1 %2', buffer.byteLength+2, target);
      return [this.append_(this.encodeLength_(0), this.randomBytes_(target))];
    } else {
      var result=this.append_(this.encodeLength_(buffer.byteLength), this.append_(buffer, this.randomBytes_(target-buffer.byteLength-2)))
//      log.info('-> %1', buffer.byteLength);
      return [result];
    }
  }

  public restore = (buffer:ArrayBuffer) : ArrayBuffer[] => {
    var parts = this.split_(buffer, 2);
    var lengthBytes = parts[0];
    var length = this.decodeLength_(lengthBytes);
    var rest = parts[1];
    if(rest.byteLength > length) {
      parts=this.split_(rest, length);
//      log.info('<- %1 %2', length, parts[0].byteLength);
      return [parts[0]];
    } else {
      return [rest];
    }
  }

  // No-op (we have no state or any resources to dispose).
  public dispose = () : void => {}

  /* Takes a number and returns a two byte (network byte order) representation
   * of this number.
   */
   // TODO(bwiley): Byte order may be backward
  private encodeLength_ = (len:number) : ArrayBuffer => {
    var bytes = new Uint8Array(2);
    bytes[0] = Math.floor(len >> 8);
    bytes[1] = Math.floor((len << 8) >> 8);
    return bytes.buffer;
  }

  /* Takes a two byte (network byte order) representation of a number and returns
   * the number.
   */
   // TODO(bwiley): Byte order may be backward
   // TODO(bwiley): Fix type error
  private decodeLength_ = (buffer:ArrayBuffer) : number => {
    var bytes = new Uint8Array(buffer);
    var result = (bytes[0] << 8) | bytes[1];
    return result;
  }

  private split_ = (buffer:ArrayBuffer, firstLen:number) : Array<ArrayBuffer> => {
    var bytes=new Uint8Array(buffer)
    var lastLen : number = buffer.byteLength-firstLen;
    var first = new Uint8Array(firstLen);
    var last = new Uint8Array(lastLen);
    var fromIndex : number = 0;
    var toIndex : number = 0;
    while(toIndex < first.length) {
      first[toIndex] = bytes[fromIndex];
      toIndex=toIndex+1;
      fromIndex=fromIndex+1;
    }

    toIndex=0;
    while(toIndex < last.length) {
      last[toIndex] = bytes[fromIndex];
      toIndex=toIndex+1;
      fromIndex=fromIndex+1;
    }

    return [first.buffer, last.buffer];
  }

  /* Takes a number representing a length and returns an ArrayBuffer of that
   * length where all bytes in the array are generated by a random number
   * generator with a uniform distribution.
   */
  private randomBytes_ = (len:number) : ArrayBuffer => {
    var bytes = new Uint8Array(len);
    for (var i = 0; i < bytes.byteLength; i++) {
      bytes[i] = Math.floor(Math.random()*255);
    }
    return bytes.buffer;
  }

  /** Concatenates two ArrayBuffers. */
  private append_ = (buffer1:ArrayBuffer, buffer2:ArrayBuffer) : ArrayBuffer => {
    var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    tmp.set(new Uint8Array(buffer1), 0);
    tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
    return tmp.buffer;
  }
}

export = PacketLengthShaper;
