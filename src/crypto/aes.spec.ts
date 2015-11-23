/// <reference path='../../../third_party/aes-js/aes-js.d.ts' />
/// <reference path='../../../third_party/simple-rc4/simple-rc4.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />
/// <reference path='../../../third_party/typings/node/node.d.ts' />

import aesjs = require('aes-js');
import arraybuffers = require('../arraybuffers/arraybuffers');
import RC4 = require('simple-rc4');

describe('aes', function() {
  it('simple encrypt/decrypt', () => {
    // aesjs.util.convertStringToBytes works too
    var key = new Uint8Array(arraybuffers.stringToArrayBuffer('Example128BitKey'));
    var iv = new Uint8Array(arraybuffers.stringToArrayBuffer('IVMustBe16Bytes.'));

    var text = 'TextMustBe16Byte';
    var textBytes = arraybuffers.arrayBufferToBuffer((arraybuffers.stringToArrayBuffer(text)));

    var cbc1 = new aesjs.ModeOfOperation.cbc(key, iv);
    var encryptedBytes = cbc1.encrypt(textBytes);

    var cbc2 = new aesjs.ModeOfOperation.cbc(key, iv);
    var decryptedBytes = arraybuffers.bufferToArrayBuffer(cbc2.decrypt(encryptedBytes));
    var decryptedText = aesjs.util.convertBytesToString(new Uint8Array(decryptedBytes));

    expect(decryptedText).toEqual(text);
  });
});


describe('rc4', function() {
  it('simple encrypt/decrypt', () => {
    var key = new Buffer([1, 2, 3, 4]);
    var text = 'hello world!';
    var buffer = new Buffer(text);

    var encoder = new RC4(key);
    encoder.update(buffer);

    var decoder = new RC4(key);
    decoder.update(buffer);

    expect(buffer.toString()).toEqual(text);
  });
});
