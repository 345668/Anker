import { db } from "./db";
import {
  messages,
  subscribers,
  type InsertMessage,
  type Message,
  type InsertSubscriber,
  type Subscriber
} from "@shared/schema";

export interface IStorage {
  createMessage(message: InsertMessage): Promise<Message>;
  createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber>;
}

export class DatabaseStorage implements IStorage {
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber> {
    const [newSubscriber] = await db
      .insert(subscribers)
      .values(subscriber)
      .returning();
    return newSubscriber;
  }
}

export const storage = new DatabaseStorage();
