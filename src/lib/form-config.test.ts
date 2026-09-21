import { describe, expect, it } from 'vitest';
import {
  defaultFormConfig,
  formSchemaFingerprint,
  formFromDbRow,
  formToDbRow,
  validateAnswerShape,
} from './form-config';

describe('defaultFormConfig', () => {
  it('starts new forms with the five editable auto-body intake steps', () => {
    expect(defaultFormConfig.steps.map((step) => step.heading)).toEqual([
      'WHERE WAS YOUR VEHICLE DAMAGED?',
      'VEHICLE YEAR, MAKE, MODEL',
      'HOW DO YOU PLAN ON PAYING FOR THE REPAIRS?',
      'WHICH INSURANCE COMPANY?',
      'THIS IS THE LAST STEP!',
    ]);

    const [damage, vehicle, payment, insurance, contact] = defaultFormConfig.steps;

    expect(damage.fields[0]).toMatchObject({
      type: 'checkbox-group',
      label: 'Damage Areas',
      hideLabel: true,
      required: true,
    });
    expect(damage.fields[0].options?.map((option) => option.label)).toEqual([
      'Front',
      'Side',
      'Rear',
      'Wheel(s)',
      'Roof',
      'Underbody',
      'Other',
    ]);

    expect(vehicle.fields[0]).toMatchObject({
      type: 'text',
      label: 'Vehicle Year, Make, Model',
      hideLabel: true,
      required: true,
    });

    expect(payment.fields[0]).toMatchObject({
      type: 'radio',
      label: 'Payment Method',
      hideLabel: true,
      required: true,
    });
    expect(payment.fields[0].options?.map((option) => option.label)).toEqual([
      'My own insurance',
      'Insurance of the person who hit me',
      "Out of pocket (you're paying)",
      'Not sure yet (we can guide you)',
    ]);

    expect(insurance.fields[0]).toMatchObject({
      type: 'text',
      label: 'Insurance Company',
      hideLabel: true,
      required: false,
    });

    expect(contact.fields).toMatchObject([
      { type: 'text', label: 'First and Last Name', required: true },
      { type: 'phone', label: 'Your Cell Phone Number', required: true },
    ]);

    const stepIds = defaultFormConfig.steps.map((step) => step.id);
    const fieldIds = defaultFormConfig.steps.flatMap((step) =>
      step.fields.map((field) => field.id)
    );
    expect(new Set(stepIds).size).toBe(stepIds.length);
    expect(new Set(fieldIds).size).toBe(fieldIds.length);
  });
});

describe('form schema fingerprints and private settings', () => {
  it('changes when a field meaning changes and ignores JSON key order', () => {
    const row = {
      steps: [
        {
          id: 'step-1',
          heading: 'Contact',
          fields: [
            {
              id: 'field-1',
              type: 'text',
              label: 'Name',
              required: true,
              validation: { maxLength: 80, minLength: 2 },
            },
          ],
        },
      ],
    };
    const reordered = {
      steps: [
        {
          heading: 'Contact',
          id: 'step-1',
          fields: [
            {
              validation: { minLength: 2, maxLength: 80 },
              required: true,
              label: 'Name',
              type: 'text',
              id: 'field-1',
            },
          ],
        },
      ],
    };
    expect(formSchemaFingerprint(row)).toBe(formSchemaFingerprint(reordered));
    expect(
      formSchemaFingerprint({
        ...row,
        steps: [{ ...row.steps[0], fields: [{ ...row.steps[0].fields[0], label: 'Full name' }] }],
      })
    ).not.toBe(formSchemaFingerprint(row));
  });

  it('keeps public-derived saves from fabricating private delivery settings', () => {
    const publicConfig = formFromDbRow({
      id: 'public-form',
      steps: defaultFormConfig.steps,
      success_message: 'Thanks',
    });
    const publicRoundTrip = formToDbRow(publicConfig);
    expect(publicRoundTrip).not.toHaveProperty('submit_webhook_url');
    expect(publicRoundTrip).not.toHaveProperty('submit_email');
    expect(publicRoundTrip).not.toHaveProperty('store_submissions');
  });

  it('keeps editor delivery settings and intentional clears in full authenticated rows', () => {
    const fullConfig = formFromDbRow({
      id: 'admin-form',
      steps: defaultFormConfig.steps,
      submit_webhook_url: 'https://fixture.invalid/hook',
      submit_email: 'fixture@example.invalid',
      store_submissions: false,
    });
    const row = formToDbRow(fullConfig);
    expect(row).toMatchObject({
      submit_webhook_url: 'https://fixture.invalid/hook',
      submit_email: 'fixture@example.invalid',
      store_submissions: false,
    });

    fullConfig.submitWebhookUrl = '';
    fullConfig.submitEmail = '';
    fullConfig.storeSubmissions = true;
    expect(formToDbRow(fullConfig)).toMatchObject({
      submit_webhook_url: '',
      submit_email: '',
      store_submissions: true,
    });
  });

  it('rejects unknown answer keys and invalid choice values before storage', () => {
    const config = {
      ...defaultFormConfig,
      steps: [
        {
          ...defaultFormConfig.steps[0],
          fields: [
            {
              ...defaultFormConfig.steps[0].fields[0],
              id: 'choice',
              type: 'radio' as const,
              options: [{ id: 'one', label: 'One' }],
            },
          ],
        },
      ],
    };
    expect(validateAnswerShape(config, { stale: 'value' })).toMatch(/reload/i);
    expect(validateAnswerShape(config, { choice: 'Two' })).toMatch(/reload/i);
    expect(validateAnswerShape(config, { choice: 'One', website: 'bot' })).toBeNull();
  });
});
