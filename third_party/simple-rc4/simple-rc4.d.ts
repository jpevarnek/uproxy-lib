/// <reference path='../typings/node/node.d.ts' />

// TypeScript definitions for aes-js:
//   https://www.npmjs.com/package/simple-rc4

declare module 'simple-rc4' {
  class RC4 {
    constructor(key:Buffer);
    // Returns the supplied Buffer.
    update(msg: Buffer): Buffer;
  }

  export = RC4;
}
