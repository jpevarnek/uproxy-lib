/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import reliable_event = require('./eventQueue');
import Aggregate = require('./aggregate');

import EventQueue = reliable_event.EventQueue;

// Simple testing class
class NumberSumAggregator implements Aggregate.Aggregator<number,string> {
  public sum :number;
  constructor(public min :number) { this.sum = 0; }
  public input = (n:number) => {
    this.sum += n;
  }
  public check = () => {
    if (this.sum < this.min) { return null; }
    var result = 'SUM_AT_OUTPUT:' + this.sum.toString();
    this.sum = 0;
    return result;
  }
}

describe('Handler EventQueue', function() {
  var eventQueue :EventQueue<string, number>;
  var ncallbacks :number;
  function lenHandler(s:string) : number { return s.length; };
  function promiseLenHandler(s:string) : Promise<number> {
    return new Promise((F,R) => {
      setTimeout(F(s.length), 1);
    });
  }

  beforeEach(() => {
    eventQueue = new EventQueue<string, number>();
    ncallbacks = 0;
  });

  it('New eventQueue has no events (length = 0)', function() {
    expect(eventQueue.getLength()).toBe(0);
  });

  it('3 events makes length = 3', function() {
    eventQueue.handle('A');
    eventQueue.handle('BB');
    eventQueue.handle('CCC');
    expect(eventQueue.getLength()).toBe(3);
  });

  it('3 events and then clearing makes length = 0', function() {
    eventQueue.handle('A').catch(() => {});
    eventQueue.handle('BB').catch(() => {});
    eventQueue.handle('CCC').catch(() => {});
    eventQueue.clear();
    expect(eventQueue.getLength()).toBe(0);
  });

  it('setSyncNextHandler then handle 2 events: leaves second event eventQueued',
      function(done) {
    var p1 = eventQueue.setSyncNextHandler(lenHandler).then((n) => {
        expect(eventQueue.isHandling()).toBe(false);
        expect(n).toBe(1);
        expect(eventQueue.getLength()).toBe(1);
      });
    expect(eventQueue.isHandling()).toBe(true);
    expect(eventQueue.getLength()).toBe(0);
    var p2 = eventQueue.handle('A').then((n) => {
        // This is the result of the handler. In this case, it is the length
        // of the handled string (i.e. 'A') which is 1.
        expect(n).toBe(1);
      });
    eventQueue.handle('BB');

    // Complete only when every promise has completed.
    Promise.all<void>([p1,p2]).then((all) => {
      expect(eventQueue.getLength()).toBe(1);
      done();
    });
  });

  it('setNextHandler then handle 2 events: leaves second event eventQueued',
      function(done) {
    eventQueue.setNextHandler(promiseLenHandler).then((s) => {
      expect(eventQueue.isHandling()).toBe(false);
      expect(s).toBe(1);
      expect(eventQueue.getLength()).toBe(1);
      done();
    });
    expect(eventQueue.isHandling()).toBe(true);
    eventQueue.handle('A');
    eventQueue.handle('BB');
  });

  it('3 events then setSyncNextHandler leaves 2 events and handles first',
      function(done) {
    eventQueue.handle('A');
    eventQueue.handle('BB');
    eventQueue.handle('CCC');
    eventQueue.setSyncNextHandler(lenHandler).then((n:number) => {
      expect(eventQueue.getLength()).toBe(2);
      expect(n).toBe(1);
      done();
    });
  });

  it('3 events then setSyncNextHandler to remove elements in order until empty',
      function(done) {
    eventQueue.handle('A');
    eventQueue.handle('BBB');
    eventQueue.setSyncNextHandler(lenHandler)
      .then((n:number) => {
          expect(++ncallbacks).toBe(1);
          expect(eventQueue.getLength()).toBe(1);
          expect(n).toBe(1);  // length of 'A'
        })
      .then(() => {
          expect(++ncallbacks).toBe(2);
          return eventQueue.setSyncNextHandler(lenHandler);
        })
      .then((n:number) => {
          expect(++ncallbacks).toBe(3);
          expect(eventQueue.getLength()).toBe(0);
          expect(n).toBe(3);  // length of 'BBB'
          // Notice that handle events canbe called mixed up with the handling.
          eventQueue.handle('CCCCC');
          expect(eventQueue.getLength()).toBe(1);
        })
      .then(() => {
          expect(++ncallbacks).toBe(4);
          return eventQueue.setSyncNextHandler(lenHandler);
        })
      .then((n:number) => {
          expect(++ncallbacks).toBe(5);
          expect(eventQueue.getLength()).toBe(0);
          expect(n).toBe(5); // length of 'CCCCC'
          done();
        })
  });

  it('successive setSyncHandler', function(done) {
    queue.handle('A');
    queue.setSyncNextHandler((s:string) => {
      expect(s).toEqual('A');
      return 0;
    }).then(() => {
      queue.setSyncNextHandler((s2:string) => {
        expect(s2).toEqual('B');
        expect(queue.getStats().handler_rejections).toEqual(0);
        done();
        return 0;
      });
      queue.handle('B');
    });
  });
});  // describe('Handler EventQueue', ... )

describe('Aggregated Handler EventQueue', function() {
  var eventQueue :EventQueue<number, string>;
  var aggregateTo10Handler :Aggregate.AggregateHandler<number,string>;
  var ncallbacks :number;

  beforeEach(() => {
    eventQueue = new EventQueue<number, string>();
    // A simple aggregator of numbers up to the specified |min|, at which
    // point the string of the sum of the numbers is returned.
    var MIN_AGGREGATION_VALUE = 10;
    aggregateTo10Handler = Aggregate.createAggregateHandler<number,string>(
        new NumberSumAggregator(MIN_AGGREGATION_VALUE));
    ncallbacks = 0;
  });

  it('Basic aggregateTo10Handler & first two handle results',
      function(done) {
    // Note that the return value for all the first three elements is the same
    // because we are using the aggregated handler. The aggregation concludes
    // only when we get over the specified min value (MIN_AGGREGATION_VALUE),
    // and then fulfills the promise for each value handled that is part of
    // that aggregation. We could write a different kind of aggregation
    // handler that does something different.
    var p1 = eventQueue.handle(4);
    p1.then((s) => {
        expect(s).toBe('SUM_AT_OUTPUT:26');
      });
    var p2 = eventQueue.handle(2);
    p2.then((s) => {
        expect(s).toBe('SUM_AT_OUTPUT:26');
      });

    // We set the handler at this point so test that the two earlier values
    // are indeed eventQueued.
    eventQueue.setHandler(aggregateTo10Handler.handle);
    expect(eventQueue.isHandling()).toBe(true);
    var p3 = eventQueue.handle(20);
    p3.then((s) => {
        expect(s).toBe('SUM_AT_OUTPUT:26');
      });

    // The return value for the next one is 21 because that is already over
    // the aggregate limit.
    var p4 = eventQueue.handle(21);
    p4.then((s) => {
        expect(s).toBe('SUM_AT_OUTPUT:21');
      });

    // The promise return value for these two will not be called because they
    // will be being processed until enough data is put on the eventQueue to
    // complete the next aggregation.
    var p5 = eventQueue.handle(5);
    p5.then((s) => {
        expect('this should never happen').toBe(null);
      });
    var p6 = eventQueue.handle(3);
    p6.then((s) => {
        expect('this should never happen either').toBe(null);
      });

    // Complete only when every promise has completed.
    Promise.all<string>([p1,p2,p3,p4]).then((all) => {
      expect(eventQueue.isHandling()).toBe(true);
      done();
    });
  });

});  // describe('Handler Aggregated EventQueue', ... )
