import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { destinationUrlSchema } from '../utils/url.validation.js';

const DNS_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_DNS_ADDRESSES = 16;

export function validateDestinationUrl(value, { allowHttp = false } = {}) {
  const parsed = destinationUrlSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      status: 'invalid',
      message: parsed.error.issues[0]?.message || 'Enter a valid HTTP or HTTPS URL.',
    };
  }

  if (new URL(parsed.data).protocol === 'http:' && !allowHttp) {
    return {
      valid: false,
      status: 'invalid',
      message: 'HTTPS is required unless you explicitly allow HTTP.',
    };
  }

  return {
    valid: true,
    status: 'valid',
    normalizedUrl: parsed.data,
    message: 'Valid URL.',
  };
}

function isPublicAddress(address) {
  try {
    return ipaddr.parse(address).range() === 'unicast';
  } catch {
    return false;
  }
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(Object.assign(new Error('Operation timed out.'), { code: 'ETIMEDOUT' })), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function resolvePublicAddress(hostname) {
  const literal = hostname.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(literal)
    ? [{ address: literal, family: ipaddr.parse(literal).kind() === 'ipv6' ? 6 : 4 }]
    : await withTimeout(dns.lookup(hostname, { all: true, verbatim: true }), DNS_TIMEOUT_MS);

  if (!addresses.length || addresses.length > MAX_DNS_ADDRESSES) {
    return { status: 'inconclusive', message: 'Destination DNS returned an unsupported number of addresses.' };
  }
  if (addresses.some(({ address }) => !isPublicAddress(address))) {
    return { status: 'inaccessible', message: 'Destination resolves to a private or non-public address and was blocked.' };
  }

  return { address: addresses[0] };
}

function requestHead(url, pinnedAddress) {
  const client = url.protocol === 'https:' ? https : http;
  const lookup = (_hostname, _options, callback) => {
    callback(null, pinnedAddress.address, pinnedAddress.family);
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const request = client.request(url, {
      method: 'HEAD',
      lookup,
      headers: { Accept: '*/*', 'Accept-Encoding': 'identity' },
    }, (response) => {
      const statusCode = response.statusCode || 0;
      response.destroy();
      if (statusCode >= 200 && statusCode < 300) {
        return finish({ status: 'reachable', httpStatus: statusCode, message: 'URL reachable.' });
      }
      if (statusCode >= 300 && statusCode < 400) {
        return finish({ status: 'inconclusive', httpStatus: statusCode, message: 'Destination redirected; redirect was not followed for security.' });
      }
      if (statusCode >= 400 && statusCode < 500) {
        return finish({ status: 'reachable', httpStatus: statusCode, message: `URL responded with HTTP ${statusCode}.` });
      }
      return finish({ status: 'inaccessible', httpStatus: statusCode, message: `Destination returned HTTP ${statusCode || 'error'}.` });
    });

    const timer = setTimeout(() => {
      request.destroy(Object.assign(new Error('Connection timed out.'), { code: 'ETIMEDOUT' }));
    }, REQUEST_TIMEOUT_MS);

    request.on('error', (error) => {
      const timedOut = error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT';
      finish({
        status: timedOut ? 'timeout' : 'inaccessible',
        message: timedOut ? 'Connection timed out.' : 'URL inaccessible.',
      });
    });
    request.end();
  });
}

export async function checkDestinationReachability(value, options = {}) {
  const validation = validateDestinationUrl(value, options);
  if (!validation.valid) return validation;

  let resolved;
  try {
    resolved = await resolvePublicAddress(new URL(validation.normalizedUrl).hostname);
  } catch (error) {
    const timedOut = error.code === 'ETIMEDOUT';
    const notFound = error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN';
    return {
      valid: true,
      status: timedOut ? 'timeout' : notFound ? 'inaccessible' : 'inconclusive',
      normalizedUrl: validation.normalizedUrl,
      message: timedOut ? 'Connection timed out while resolving the destination.'
        : notFound ? 'Destination hostname could not be resolved.'
          : 'Destination verification inconclusive.',
    };
  }

  if (!resolved.address) {
    return { valid: true, normalizedUrl: validation.normalizedUrl, ...resolved };
  }

  const response = await requestHead(new URL(validation.normalizedUrl), resolved.address);
  return { valid: true, normalizedUrl: validation.normalizedUrl, ...response };
}