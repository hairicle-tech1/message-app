export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Internal Messenger API',
    version: '1.0.0',
    description:
      'REST API for the Internal Messenger App. All protected routes require a Bearer JWT obtained from `POST /api/auth/login`.',
  },
  servers: [{ url: 'http://localhost:4000', description: 'Local dev' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string' },
          username: { type: 'string' },
          displayName: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          department: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['employee', 'admin'] },
        },
      },
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['direct', 'group', 'channel'] },
          name: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          created_by: { type: 'string', format: 'uuid' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          members: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                user_id: { type: 'string', format: 'uuid' },
                username: { type: 'string' },
                display_name: { type: 'string' },
                role: { type: 'string' },
                joined_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          conversationId: { type: 'string', format: 'uuid' },
          senderId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['text', 'image', 'video', 'audio', 'file', 'system'] },
          ciphertext: { type: 'string', description: 'Base64-encoded message content' },
          replyToMessageId: { type: 'string', format: 'uuid', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          editedAt: { type: 'string', format: 'date-time', nullable: true },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          file: {
            nullable: true,
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              fileName: { type: 'string' },
              mimeType: { type: 'string' },
              sizeBytes: { type: 'integer' },
              hasThumbnail: { type: 'boolean' },
            },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'object' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ── Auth ────────────────────────────────────────────────────────────────
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and get a JWT',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'admin@company.local' },
                  password: { type: 'string', example: 'ChangeMe123!' },
                  deviceName: { type: 'string', example: 'web-desktop' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    deviceId: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user from JWT',
        responses: {
          200: { description: 'Current user', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          401: { description: 'Unauthorized' },
        },
      },
    },

    // ── Users ────────────────────────────────────────────────────────────────
    '/api/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get own full profile',
        responses: {
          200: { description: 'Own profile', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Update own display name and/or department',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  displayName: { type: 'string', example: 'John Doe' },
                  department: { type: 'string', nullable: true, example: 'Engineering' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated profile', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          400: { description: 'Validation error' },
        },
      },
    },
    '/api/users/me/avatar': {
      post: {
        tags: ['Users'],
        summary: 'Upload or replace own avatar (max 5 MB image)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['avatar'],
                properties: {
                  avatar: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated profile with new avatarUrl', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          400: { description: 'No file or non-image uploaded' },
        },
      },
    },
    '/api/users/me/password': {
      post: {
        tags: ['Users'],
        summary: 'Change own password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', example: 'ChangeMe123!' },
                  newPassword: { type: 'string', minLength: 8, example: 'NewPass456!' },
                },
              },
            },
          },
        },
        responses: {
          204: { description: 'Password changed' },
          400: { description: 'New password too short' },
          403: { description: 'Current password incorrect' },
        },
      },
    },
    '/api/users/{userId}/avatar': {
      get: {
        tags: ['Users'],
        summary: "Stream any user's avatar (webp)",
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Avatar image (image/webp)' },
          404: { description: 'No avatar set' },
        },
      },
    },
    '/api/users/directory': {
      get: {
        tags: ['Users'],
        summary: 'List all active users (for starting conversations)',
        responses: {
          200: { description: 'User list', content: { 'application/json': { schema: { type: 'object', properties: { users: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } } },
        },
      },
    },
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'List all users — admin only',
        responses: {
          200: { description: 'All users' },
          403: { description: 'Admin only' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a user — admin only (closed registration)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'username', 'displayName', 'password'],
                properties: {
                  email: { type: 'string', example: 'alice@company.local' },
                  username: { type: 'string', example: 'alice' },
                  displayName: { type: 'string', example: 'Alice' },
                  password: { type: 'string', example: 'ChangeMe123!' },
                  department: { type: 'string', example: 'Engineering' },
                  role: { type: 'string', enum: ['employee', 'admin'], example: 'employee' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User created' },
          403: { description: 'Admin only' },
        },
      },
    },

    // ── Conversations ────────────────────────────────────────────────────────
    '/api/conversations': {
      post: {
        tags: ['Conversations'],
        summary: 'Create a conversation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'memberIds'],
                properties: {
                  type: { type: 'string', enum: ['direct', 'group', 'channel'], example: 'direct' },
                  name: { type: 'string', example: 'Team Chat' },
                  memberIds: { type: 'array', items: { type: 'string', format: 'uuid' }, example: ['<userId>'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Conversation created', content: { 'application/json': { schema: { type: 'object', properties: { conversation: { $ref: '#/components/schemas/Conversation' } } } } } },
        },
      },
      get: {
        tags: ['Conversations'],
        summary: 'List all conversations for the current user',
        responses: {
          200: { description: 'Conversation list', content: { 'application/json': { schema: { type: 'object', properties: { conversations: { type: 'array', items: { $ref: '#/components/schemas/Conversation' } } } } } } },
        },
      },
    },
    '/api/conversations/{id}': {
      get: {
        tags: ['Conversations'],
        summary: 'Get a single conversation with members',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Conversation', content: { 'application/json': { schema: { type: 'object', properties: { conversation: { $ref: '#/components/schemas/Conversation' } } } } } },
          403: { description: 'Not a member' },
        },
      },
    },
    '/api/conversations/{id}/media': {
      get: {
        tags: ['Conversations'],
        summary: 'List image/video messages for the media gallery',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Media items', content: { 'application/json': { schema: { type: 'object', properties: { media: { type: 'array', items: { type: 'object' } } } } } } },
        },
      },
    },
    '/api/conversations/{id}/attachments': {
      get: {
        tags: ['Conversations'],
        summary: 'List file/audio attachments',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'types', in: 'query', schema: { type: 'string', example: 'file,audio' }, description: 'Comma-separated list of message types to include' },
        ],
        responses: {
          200: { description: 'Attachment items' },
        },
      },
    },
    '/api/conversations/{id}/members': {
      post: {
        tags: ['Conversations'],
        summary: 'Add a member (owner/admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' } } } } },
        },
        responses: { 204: { description: 'Member added' } },
      },
    },
    '/api/conversations/{id}/members/{userId}': {
      delete: {
        tags: ['Conversations'],
        summary: 'Remove a member or leave the conversation',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 204: { description: 'Member removed' } },
      },
    },

    // ── Messages ─────────────────────────────────────────────────────────────
    '/api/messages': {
      post: {
        tags: ['Messages'],
        summary: 'Send a message',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['conversationId'],
                properties: {
                  conversationId: { type: 'string', format: 'uuid' },
                  type: { type: 'string', enum: ['text', 'image', 'video', 'audio', 'file'], example: 'text' },
                  ciphertext: { type: 'string', description: 'Base64-encoded text. Use btoa("hello") in browser.', example: 'aGVsbG8=' },
                  fileId: { type: 'string', format: 'uuid', description: 'File ID from POST /api/files' },
                  replyToMessageId: { type: 'string', format: 'uuid', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Message sent', content: { 'application/json': { schema: { type: 'object', properties: { message: { $ref: '#/components/schemas/Message' } } } } } },
        },
      },
      get: {
        tags: ['Messages'],
        summary: 'List messages (newest first, paginated)',
        parameters: [
          { name: 'conversationId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'before', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Cursor — return messages before this message ID' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        ],
        responses: {
          200: { description: 'Message list', content: { 'application/json': { schema: { type: 'object', properties: { messages: { type: 'array', items: { $ref: '#/components/schemas/Message' } } } } } } },
        },
      },
    },
    '/api/messages/{id}/read': {
      post: {
        tags: ['Messages'],
        summary: 'Mark a message as read for the current device',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 204: { description: 'Marked read' } },
      },
    },
    '/api/messages/{id}/receipts': {
      get: {
        tags: ['Messages'],
        summary: 'Get read receipts for a message',
        description:
          'Returns the list of conversation members (other than the sender) who have read this message, and when. Requester must be a member of the conversation.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: {
            description: 'Read receipt list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    receipts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          userId: { type: 'string', format: 'uuid' },
                          username: { type: 'string' },
                          displayName: { type: 'string' },
                          avatarUrl: { type: 'string', nullable: true },
                          readAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                    memberCount: { type: 'integer', description: 'Total conversation member count' },
                  },
                },
              },
            },
          },
          403: { description: 'Not a member of this conversation' },
          404: { description: 'Message not found' },
        },
      },
    },
    '/api/messages/{id}': {
      patch: {
        tags: ['Messages'],
        summary: 'Edit own message (blocked if already deleted)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['ciphertext'], properties: { ciphertext: { type: 'string', example: 'bmV3IHRleHQ=' } } } } },
        },
        responses: {
          200: { description: 'Updated message' },
          403: { description: 'Not your message' },
          400: { description: 'Message already deleted' },
        },
      },
      delete: {
        tags: ['Messages'],
        summary: 'Soft-delete own message (shows placeholder to all members)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Deleted — returns { id, conversationId, deletedAt }' },
          403: { description: 'Not your message' },
        },
      },
    },

    // ── Files ─────────────────────────────────────────────────────────────────
    '/api/files': {
      post: {
        tags: ['Files'],
        summary: 'Upload a file (attach to a message via fileId)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'File uploaded — returns { file: { id, fileName, mimeType, sizeBytes, hasThumbnail } }' },
        },
      },
    },
    '/api/files/{id}': {
      get: {
        tags: ['Files'],
        summary: 'Download/stream a file (must be a conversation member)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'File stream' },
          403: { description: 'Not a member of the conversation the file belongs to' },
          404: { description: 'File not found' },
        },
      },
    },
    '/api/files/{id}/thumbnail': {
      get: {
        tags: ['Files'],
        summary: 'Download image thumbnail (320px webp — images only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Thumbnail (image/webp)' },
          404: { description: 'No thumbnail (not an image or not yet generated)' },
        },
      },
    },
  },
};
