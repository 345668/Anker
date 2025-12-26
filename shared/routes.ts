import { z } from 'zod';
import { 
  insertMessageSchema, insertSubscriberSchema, insertStartupSchema, 
  insertInvestorSchema, insertInvestmentFirmSchema, insertContactSchema, insertDealSchema,
  insertDealRoomSchema, insertDealRoomDocumentSchema, insertDealRoomNoteSchema, insertDealRoomMilestoneSchema,
  insertPitchDeckAnalysisSchema,
  insertEmailTemplateSchema, insertOutreachSchema, insertMatchSchema, insertInteractionLogSchema,
  messages, subscribers, startups, investors, investmentFirms, contacts, deals,
  dealRooms, dealRoomDocuments, dealRoomNotes, dealRoomMilestones, pitchDeckAnalyses,
  emailTemplates, outreaches, matches, interactionLogs
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  messages: {
    create: {
      method: 'POST' as const,
      path: '/api/messages',
      input: insertMessageSchema,
      responses: {
        201: z.custom<typeof messages.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  subscribers: {
    create: {
      method: 'POST' as const,
      path: '/api/subscribers',
      input: insertSubscriberSchema,
      responses: {
        201: z.custom<typeof subscribers.$inferSelect>(),
        400: errorSchemas.validation,
        409: z.object({ message: z.string() }),
      },
    },
  },
  startups: {
    list: {
      method: 'GET' as const,
      path: '/api/startups',
      responses: {
        200: z.array(z.custom<typeof startups.$inferSelect>()),
      },
    },
    myStartups: {
      method: 'GET' as const,
      path: '/api/startups/mine',
      responses: {
        200: z.array(z.custom<typeof startups.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/startups/:id',
      responses: {
        200: z.custom<typeof startups.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/startups',
      input: insertStartupSchema,
      responses: {
        201: z.custom<typeof startups.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/startups/:id',
      input: insertStartupSchema.partial(),
      responses: {
        200: z.custom<typeof startups.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/startups/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  investors: {
    list: {
      method: 'GET' as const,
      path: '/api/investors',
      responses: {
        200: z.array(z.custom<typeof investors.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/investors/:id',
      responses: {
        200: z.custom<typeof investors.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/investors',
      input: insertInvestorSchema,
      responses: {
        201: z.custom<typeof investors.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/investors/:id',
      input: insertInvestorSchema.partial(),
      responses: {
        200: z.custom<typeof investors.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/investors/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  firms: {
    list: {
      method: 'GET' as const,
      path: '/api/firms',
      responses: {
        200: z.array(z.custom<typeof investmentFirms.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/firms/:id',
      responses: {
        200: z.custom<typeof investmentFirms.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/firms',
      input: insertInvestmentFirmSchema,
      responses: {
        201: z.custom<typeof investmentFirms.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/firms/:id',
      input: insertInvestmentFirmSchema.partial(),
      responses: {
        200: z.custom<typeof investmentFirms.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/firms/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  contacts: {
    list: {
      method: 'GET' as const,
      path: '/api/contacts',
      responses: {
        200: z.array(z.custom<typeof contacts.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/contacts/:id',
      responses: {
        200: z.custom<typeof contacts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/contacts',
      input: insertContactSchema.omit({ ownerId: true }),
      responses: {
        201: z.custom<typeof contacts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/contacts/:id',
      input: insertContactSchema.omit({ ownerId: true }).partial(),
      responses: {
        200: z.custom<typeof contacts.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/contacts/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  deals: {
    list: {
      method: 'GET' as const,
      path: '/api/deals',
      responses: {
        200: z.array(z.custom<typeof deals.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/deals/:id',
      responses: {
        200: z.custom<typeof deals.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/deals',
      input: insertDealSchema.omit({ ownerId: true }),
      responses: {
        201: z.custom<typeof deals.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/deals/:id',
      input: insertDealSchema.omit({ ownerId: true }).partial(),
      responses: {
        200: z.custom<typeof deals.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/deals/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  dealRooms: {
    list: {
      method: 'GET' as const,
      path: '/api/deal-rooms',
      responses: {
        200: z.array(z.custom<typeof dealRooms.$inferSelect>()),
      },
    },
    byDeal: {
      method: 'GET' as const,
      path: '/api/deals/:dealId/rooms',
      responses: {
        200: z.array(z.custom<typeof dealRooms.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/deal-rooms/:id',
      responses: {
        200: z.custom<typeof dealRooms.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/deal-rooms',
      input: insertDealRoomSchema.omit({ ownerId: true }),
      responses: {
        201: z.custom<typeof dealRooms.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/deal-rooms/:id',
      input: insertDealRoomSchema.omit({ ownerId: true }).partial(),
      responses: {
        200: z.custom<typeof dealRooms.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/deal-rooms/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  dealRoomDocuments: {
    list: {
      method: 'GET' as const,
      path: '/api/deal-rooms/:roomId/documents',
      responses: {
        200: z.array(z.custom<typeof dealRoomDocuments.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/deal-room-documents/:id',
      responses: {
        200: z.custom<typeof dealRoomDocuments.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/deal-rooms/:roomId/documents',
      input: insertDealRoomDocumentSchema.omit({ roomId: true, uploadedBy: true }),
      responses: {
        201: z.custom<typeof dealRoomDocuments.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/deal-room-documents/:id',
      input: insertDealRoomDocumentSchema.omit({ roomId: true, uploadedBy: true }).partial(),
      responses: {
        200: z.custom<typeof dealRoomDocuments.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/deal-room-documents/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  dealRoomNotes: {
    list: {
      method: 'GET' as const,
      path: '/api/deal-rooms/:roomId/notes',
      responses: {
        200: z.array(z.custom<typeof dealRoomNotes.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/deal-room-notes/:id',
      responses: {
        200: z.custom<typeof dealRoomNotes.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/deal-rooms/:roomId/notes',
      input: insertDealRoomNoteSchema.omit({ roomId: true, authorId: true }),
      responses: {
        201: z.custom<typeof dealRoomNotes.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/deal-room-notes/:id',
      input: insertDealRoomNoteSchema.omit({ roomId: true, authorId: true }).partial(),
      responses: {
        200: z.custom<typeof dealRoomNotes.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/deal-room-notes/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  dealRoomMilestones: {
    list: {
      method: 'GET' as const,
      path: '/api/deal-rooms/:roomId/milestones',
      responses: {
        200: z.array(z.custom<typeof dealRoomMilestones.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/deal-room-milestones/:id',
      responses: {
        200: z.custom<typeof dealRoomMilestones.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/deal-rooms/:roomId/milestones',
      input: insertDealRoomMilestoneSchema.omit({ roomId: true, createdBy: true }),
      responses: {
        201: z.custom<typeof dealRoomMilestones.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/deal-room-milestones/:id',
      input: insertDealRoomMilestoneSchema.omit({ roomId: true, createdBy: true }).partial(),
      responses: {
        200: z.custom<typeof dealRoomMilestones.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/deal-room-milestones/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  pitchDeckAnalyses: {
    list: {
      method: 'GET' as const,
      path: '/api/deal-rooms/:roomId/analyses',
      responses: {
        200: z.array(z.custom<typeof pitchDeckAnalyses.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/pitch-deck-analyses/:id',
      responses: {
        200: z.custom<typeof pitchDeckAnalyses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/deal-rooms/:roomId/analyses',
      input: z.object({
        documentId: z.string().optional(),
        pitchDeckContent: z.string().optional(),
      }),
      responses: {
        201: z.custom<typeof pitchDeckAnalyses.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/pitch-deck-analyses/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  emailTemplates: {
    list: {
      method: 'GET' as const,
      path: '/api/email-templates',
      responses: {
        200: z.array(z.custom<typeof emailTemplates.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/email-templates/:id',
      responses: {
        200: z.custom<typeof emailTemplates.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/email-templates',
      input: insertEmailTemplateSchema,
      responses: {
        201: z.custom<typeof emailTemplates.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/email-templates/:id',
      input: insertEmailTemplateSchema.partial(),
      responses: {
        200: z.custom<typeof emailTemplates.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/email-templates/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  outreaches: {
    list: {
      method: 'GET' as const,
      path: '/api/outreaches',
      responses: {
        200: z.array(z.custom<typeof outreaches.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/outreaches/:id',
      responses: {
        200: z.custom<typeof outreaches.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/outreaches',
      input: insertOutreachSchema,
      responses: {
        201: z.custom<typeof outreaches.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/outreaches/:id',
      input: insertOutreachSchema.partial(),
      responses: {
        200: z.custom<typeof outreaches.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/outreaches/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  matches: {
    list: {
      method: 'GET' as const,
      path: '/api/matches',
      responses: {
        200: z.array(z.custom<typeof matches.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/matches/:id',
      responses: {
        200: z.custom<typeof matches.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/matches',
      input: insertMatchSchema,
      responses: {
        201: z.custom<typeof matches.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/matches/:id',
      input: insertMatchSchema.partial(),
      responses: {
        200: z.custom<typeof matches.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/matches/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  interactionLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/interaction-logs',
      responses: {
        200: z.array(z.custom<typeof interactionLogs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/interaction-logs',
      input: insertInteractionLogSchema,
      responses: {
        201: z.custom<typeof interactionLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
