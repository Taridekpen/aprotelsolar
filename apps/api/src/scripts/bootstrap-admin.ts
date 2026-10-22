import '../config/load-dotenv.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { loadEnv } from '../config/env.js';
import { ensureBootstrapAdmin } from '../services/auth.service.js';

const env = loadEnv();
await connectDatabase(env);
const result = await ensureBootstrapAdmin(env);
console.log(result.created ? 'Super administrator created.' : 'No super administrator was created.');
await disconnectDatabase();
