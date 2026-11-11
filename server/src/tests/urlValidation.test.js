import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDestinationReachability, validateDestinationUrl } from '../services/urlValidation.js';

test('destination URL validation accepts normalized external HTTP and HTTPS URLs', () => {
  const httpsResult = validateDestinationUrl('HTTPS://Example.COM/document.pdf?q=one&ref=two');
  assert.equal(httpsResult.status, 'valid');
  assert.equal(httpsResult.normalizedUrl, 'https://example.com/document.pdf?q=one&ref=two');
  assert.equal(validateDestinationUrl('http://outside.example/resource').valid, false);
  assert.equal(validateDestinationUrl('http://outside.example/resource', { allowHttp: true }).valid, true);

  const longUrl = `https://outside.example/${'x'.repeat(2000)}`;
  assert.equal(validateDestinationUrl(longUrl).valid, true);
});

test('destination URL validation rejects malformed, unsafe, and credential-bearing URLs', () => {
  for (const destinationUrl of [
    'outside.example/document.pdf',
    'ftp://outside.example/document.pdf',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
    'https://user:password@outside.example/document.pdf',
    `https://outside.example/${'x'.repeat(2048)}`,
  ]) {
    assert.equal(validateDestinationUrl(destinationUrl).status, 'invalid', destinationUrl);
  }
});

test('reachability check blocks loopback and private network destinations before connecting', async () => {
  for (const destinationUrl of [
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[fd00::1]/',
  ]) {
    const result = await checkDestinationReachability(destinationUrl, { allowHttp: true });
    assert.equal(result.status, 'inaccessible', destinationUrl);
    assert.match(result.message, /private or non-public address/);
  }
});
