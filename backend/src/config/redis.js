const redis = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined,
};

// Opciones reutilizables para instancias Bull
function getRedisOpciones() {
  const url = new URL(redis.url);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    ...(redis.password && { password: redis.password }),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

module.exports = { getRedisOpciones, redisConfig: redis };
