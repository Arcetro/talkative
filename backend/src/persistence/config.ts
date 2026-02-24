export function isDatabasePersistenceEnabled(): boolean {
  const driver = (process.env.PERSISTENCE_DRIVER ?? "fs").trim().toLowerCase();
  return driver === "db" || driver === "database" || driver === "postgres" || driver === "postgresql";
}
