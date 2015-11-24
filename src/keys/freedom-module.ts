/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />
/// <reference path='../../../third_party/typings/node/node.d.ts' />
/// <reference path='../../../third_party/typings/ssh2/ssh2.d.ts' />

import logging = require('../logging/logging');
import loggingTypes = require('../loggingprovider/loggingprovider.types');

import * as ssh2 from 'ssh2';
var Client = require('ssh2').Client;

export var loggingController = freedom['loggingcontroller']();
loggingController.setDefaultFilter(loggingTypes.Destination.console,
                                   loggingTypes.Level.debug);

var log :logging.Log = new logging.Log('keys');

var encoded = 'LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFcEFJQkFBS0NBUUVBMTFIZ2x4OGVRZGJvb0IrSVlQSFNjSlh5cXZOYVV6bkVQQnJjZlBWM0xxT1M1ak1zCmdWdjhMMnFwNU04VU1LcDhhcGxZOFZHTEhxOWl4V3VycTB3aEVCUjFzY3JEaXNHMDROTnFyQzlFaGs2YlBoN3YKbUFWOHA5czQ5RnNOdlplQ0krcEw5Mi9aV1pvWlB5V0xyZTNTejZqbmFlalZNUHhHNTFaM1ZmcHZ6L0VTak9HYQpLNGRFVUpndWZEWmQ0b0QxejV0bW5lWVUxVnk1c21QbTBaWXhKNUZTU1BMcndPZXVUeC9KSkFMSEM0dm1zQjRCCnpaVERsYW9QYXZvV0hJeFJ5ZHJxak5CNldqcXcrWmYrOUxsUHlFdXRiTVN0S0NZQmNIUUNEejVnY0kycDRlK1AKbEIvMDZYems4MmppaTNrekxGanJpZnhsTlpuQnNJK1dNcGxMM3dJREFRQUJBb0lCQUJmOWtXNkZFeFAyNC9oagpTd2l5S09aT2JybEpYL2tCNkxGaHRNdGZkaVlHSjZucWJiMEVDTGNueFVJdktHcTd0QjBVZE9wK1VXZmIxcjkwClhhNDZUenpCYXRPaWFlTWQ3ZzlXdnYzc1RsQkFsZDk0QnU0RFBuNWRXSjB4UC9pdDF0dzFrTDFEQXc2T3N0MXMKUzRIWGk3T0RlRFUrc2ZKQlNZMGcveTdmTm5JT2o5VXMyTlpoUWMyNWtMQklpRm1aZjNMd1dmTU9aMlZaRUpIMAo0NWtjcVMrY3VHNktGUm1sUDU3NWdLTktoZmp5Rzc4TGFsSU5pckluOFAxeVJzcU9aNVIvMXR2SWdMREdlRmdzCkFYZHNwaFMvLzl5MGI3WENJdDczMC82MDdSQXJta1U3TnFUdEl5alZSVXowRC83eldhR0YvREdCSnNWdjE1ZVUKTjhrTlR4RUNnWUVBN3NHdC9STFM0Nms5MDJZcUlWK2kySFZLZndOZGFxVVFNWmNRdU9Cc2lxLzJGTC85cStTbQp0b2pTQjhrT0tiQnRRQnRaVXNpelZmbERvU2ZDQ2RaZE5ha2NkZXF3eW1qWC84eGkvLzlJMW5BaVhod2x5b3FiCkVnVkF0OHhySHhIMDk2ZDRHMENpa2F1RXZCQUFRaUlLU0o4WFlTakdRVjVGL01vN0lxYzZkUXNDZ1lFQTV0N2gKZ1Z0aUgzclpyTmxJY2dHbFdrVVR6UXkrU2Y3cmZkVnZ1NlpvZHlETnl6TG56S3FaSWJKOXVyeUV6WG13TU9JUgpSa2dnMjhiTWpWaWhiVGZFbUtBWkkvRGpjSUw2dlFFRlFpYk1XSHJ2M0tYTm82U1BWS0ZPaURuMVJVSDNEeXpoCndkOGFHUTc1c3BkK1ZIQlQ1b1pCK0o5dHpjazJTSm5vZmdSKzRQMENnWUVBeThsZ3VudlFxU1VSY2xqbmFPajYKVkF0NDlJUm92ZGY1eEhvT2VkNkVock8rTk9QU24xOWd0TGgvbk1tTlh5UUpmQWhiNjM4SEkwREk2c3JHb2lMbwpHQjhwL2JPK0JtWUt4M2txbnhyRWp0UFRZY1JndFVvdEplcDUzT2VNSDA3eWFsZjArajNuQkxNRGJvbXh6c0REClNrMFFaWXVwL0sxOHkxSEp1OEJFOHhVQ2dZQVlYZXZGSUdVQjE1Q0Q2c2IzcVc3UFVUMGV4anFMU3NtR0ZYSGUKaDFpOVFnd1daMEFKM1BPZWw5MG5TV0JtNDNJU0pyb1dCZVRaN1dpSGZwUkRGOEM3THlLWUpZT0x5M2MxWFpjMQpmU3pTSmQrTkZUN1lCN1ZOQkYxcWlWdDJ2TmlibEd3YmJ6V3M4V1N2VWNmMmw0aHphellwVElKbFZ0aFEzMVduCmYwZjQ3UUtCZ1FDaXpySDBQOEdIS09KaXdNaEZmekNQd2ZrdXNhYlRWUW1tcENQVWdjdjEwd3ByRURrc1lnWDUKN3FzWFh4MXRHL3c2VjNMbXhld2JieFgwRW1NSmIyaVB4QVphbzcrOFhMbUIxalU1aWVKK3hRS3ZvWFk0MEtZNwpGQ3MrdzZkNG4zSG5WdGw0Q2VoSjhFNDlvNzlUVXlCZGxTaXpzUi9SM0swNUxvVDhFamZSckE9PQotLS0tLUVORCBSU0EgUFJJVkFURSBLRVktLS0tLQo=';
var decoded = new Buffer(encoded, 'base64');

new Client().on('ready', () => {
  log.info('ready!');
}).on('error', (e: Error) => {
  log.error('error: %1', e);
}).on('end', () => {
  log.info('end');
}).on('close', (hadError: boolean) => {
  log.info('close');
}).connect({
  host: 'localhost',
  port: 5000,
  username: 'giver',
  privateKey: decoded
});
