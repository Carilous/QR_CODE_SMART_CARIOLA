import { z } from 'zod';
import { checkDestinationReachability, validateDestinationUrl } from '../services/urlValidation.js';

const validationRequestSchema = z.object({
  destinationUrl: z.string().max(2048),
  allowHttp: z.boolean().default(false),
});
const reachabilityRequestSchema = z.object({
  destinationUrl: z.string().max(2048),
  allowHttp: z.boolean().default(true),
});

export function validateDestination(request, response) {
  const { destinationUrl, allowHttp } = validationRequestSchema.parse(request.body);
  return response.json(validateDestinationUrl(destinationUrl, { allowHttp }));
}

export async function verifyDestinationReachability(request, response) {
  const { destinationUrl, allowHttp } = reachabilityRequestSchema.parse(request.body);
  return response.json(await checkDestinationReachability(destinationUrl, { allowHttp }));
}