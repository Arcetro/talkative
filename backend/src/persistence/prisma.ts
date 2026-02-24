import { PrismaClient } from "@prisma/client";

let singleton: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!singleton) {
    singleton = new PrismaClient();
  }
  return singleton;
}

