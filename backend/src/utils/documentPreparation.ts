// src/utils/documentPreparation.ts

/**
 * Helper function to prepare documents for frontend serialization.
 * Converts specific BSON types (like ObjectId and Date) to their string representations
 * to ensure they are safely serializable and consumable by the frontend.
 * Recursively processes nested objects and arrays.
 * @param doc The document or value to prepare.
 * @returns The prepared document/value.
 */
export function prepareDocumentForFrontend(doc: any): any {
  if (!doc) {
    return doc;
  }

  if (doc instanceof Date) {
    return doc.toISOString();
  }

  if (typeof doc !== 'object') {
    return doc;
  }

  if (Array.isArray(doc)) {
    return doc.map(item => prepareDocumentForFrontend(item));
  }

  const newDoc: { [key: string]: any } = {};
  for (const key in doc) {
    if (Object.prototype.hasOwnProperty.call(doc, key)) {
      const value = doc[key];

      if (value && typeof value === 'object' && value._bsontype === 'ObjectID' && typeof value.toHexString === 'function') {
        newDoc[key] = value.toHexString();
      }
      else if (value instanceof Date) {
        newDoc[key] = value.toISOString();
      }
      else if (typeof value === 'object' && value !== null) {
        newDoc[key] = prepareDocumentForFrontend(value);
      }
      else {
        newDoc[key] = value;
      }
    }
  }
  return newDoc;
}
