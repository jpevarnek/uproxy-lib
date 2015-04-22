/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />
/// <reference path="../../../third_party/freedom-typings/rtcpeerconnection.d.ts" />

import MockFreedomRtcDataChannel = require('../freedom/mocks/mock-rtcdatachannel');

import freedomMocker = require('../freedom/mocks/mock-freedom-in-module-env');
freedom = freedomMocker.makeMockFreedomInModuleEnv({
  'rtcdatachannel': () => { return new MockFreedomRtcDataChannel(); }
});

import datachannel = require('./datachannel');

describe('DataChannel', function() {
  var mockRtcDataChannel :MockFreedomRtcDataChannel;

  beforeEach(function() {
    mockRtcDataChannel = new MockFreedomRtcDataChannel();
  });

  // Ensure that close() waits for all outgoing unsent messages to be sent:
  //   https://github.com/uProxy/uproxy/issues/1218
  //   https://github.com/uProxy/uproxy/issues/1113
  it('close waits for all data to be sent', (done) => {
    // The core.rtcdatachannel is initially open.
    spyOn(mockRtcDataChannel, 'getReadyState').and.returnValue(
        Promise.resolve('open'));

    // Have core.rtcdatachannel emit an onclose event when its
    // close() method is invoked.
    var closeSpy = spyOn(mockRtcDataChannel, 'close').and.callFake(() => {
      mockRtcDataChannel.handleEvent('onclose');
    });

    // Pretend the core.rtcdatachannel is buffering a lot of data.
    // This will cause DataChannel to buffer sends.
    var getBufferedAmountSpy = spyOn(mockRtcDataChannel, 'getBufferedAmount');
    getBufferedAmountSpy.and.callFake(() => {
      return Promise.resolve(datachannel.PC_QUEUE_LIMIT);
    });

    var sendBufferSpy = spyOn(mockRtcDataChannel, 'sendBuffer');

    datachannel.createFromRtcDataChannel(mockRtcDataChannel).then(
        (channel:datachannel.DataChannel) => {
      var readyToClose = false;
      channel.send({
        buffer: new Uint8Array([0, 1, 2]).buffer
      });

      channel.close();

      // At this point, our message should not yet have been sent.
      // Now that we've requested the channel be closed, "unblock" the
      // core.rtcdatachannel to drain the message queue.
      expect(sendBufferSpy).not.toHaveBeenCalled();
      getBufferedAmountSpy.and.returnValue(Promise.resolve(
          datachannel.PC_QUEUE_LIMIT / 2));

      // Wait for 100 ms, substantially longer than the 20 ms interval used
      // by the congestion control handler to check for room in the browser's
      // send buffer. During that time, DataChannel should wake up, detect
      // the free space, and call send.
      setTimeout(() => {
        expect(sendBufferSpy).toHaveBeenCalled();

        // After send has been called, now simulate the browser successfully
        // sending the data, and hence draining its buffer.  This means that
        // the channel is now ready to close.
        getBufferedAmountSpy.and.returnValue(Promise.resolve(0));
        readyToClose = true;
      }, 100);

      channel.onceClosed.then(() => {
        expect(readyToClose).toBe(true);
        done();
      });
    });
  });

  it('the buffer loop stops if the remote peer closes', (done) => {
    // The core.rtcdatachannel is initially open.
    spyOn(mockRtcDataChannel, 'getReadyState').and.returnValue(
        Promise.resolve('open'));

    // Pretend the core.rtcdatachannel is buffering a lot of data.
    var getBufferedAmountSpy = spyOn(mockRtcDataChannel, 'getBufferedAmount');
    getBufferedAmountSpy.and.callFake(() => {
      return Promise.resolve(datachannel.PC_QUEUE_LIMIT);
    });

    datachannel.createFromRtcDataChannel(mockRtcDataChannel).then(
        (channel:datachannel.DataChannel) => {
      channel.onceOpened.then(() => {
        var baselineBufferedAmountCalls = getBufferedAmountSpy.calls.count();
        channel.close();

        // channel.close() starts the loop, which will check getBufferedAmount
        // every 20 ms, but does not synchronously check it.
        expect(getBufferedAmountSpy.calls.count()).toEqual(baselineBufferedAmountCalls);

        // Have core.rtcdatachannel immediately emit an onclose event, as if the remote
        // peer had closed the connection.  This should take effect in <20 ms.
        mockRtcDataChannel.handleEvent('onclose');

        channel.onceClosed.then(() => {
          // In the next 200 ms, there should only be two additional calls to
          // getBufferedAmount: one while checking if we are out of overflow yet,
          // and another in the first pass of the draining loop, before that loop
          // terminates.
          setTimeout(() => {
            expect(getBufferedAmountSpy.calls.count()).toEqual(
                baselineBufferedAmountCalls + 2);
            done();
          }, 200);
        });

      });
    });
  });
});