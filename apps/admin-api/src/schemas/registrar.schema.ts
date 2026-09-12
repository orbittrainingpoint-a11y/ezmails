import { z } from "zod";

export const namecheapCredentialsSchema = z.object({
  apiUser: z.string().min(1),
  apiKey: z.string().min(1),
  username: z.string().min(1),
  clientIp: z.string().ip(),
});
