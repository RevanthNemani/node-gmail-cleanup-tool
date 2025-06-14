import { expect } from 'chai';
import { readUniqueEmails } from '../Functions/assignLabel.mjs';

describe('readUniqueEmails', () => {
  it('returns deduplicated, trimmed list with no empty entries', async () => {
    const mockSheets = {
      spreadsheets: {
        values: {
          get: async () => ({
            data: { values: [
              [' email1@example.com '],
              ['email2@example.com'],
              ['email1@example.com'],
              ['   '],
              [''],
              ['\tEmail3@example.com  ']
            ] }
          })
        }
      }
    };

    const result = await readUniqueEmails(mockSheets);
    expect(result).to.deep.equal([
      'email1@example.com',
      'email2@example.com',
      'Email3@example.com'
    ]);
  });
});
