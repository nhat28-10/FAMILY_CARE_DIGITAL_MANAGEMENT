import { FinanceModelType } from '@prisma/client';

export interface FinanceModelTemplateJar {
  name: string;
  jarCode: string;
  allocationPercentage: number;
  description: string;
}

export interface FinanceModelTemplate {
  modelType: FinanceModelType;
  name: string;
  description: string;
  jars: FinanceModelTemplateJar[];
}

export const FINANCE_MODEL_TEMPLATES: FinanceModelTemplate[] = [
  {
    modelType: FinanceModelType.FIVE_JARS,
    name: 'Five Jars',
    description: 'Allocate family finances across five planning jars.',
    jars: [
      {
        name: 'Necessities',
        jarCode: 'NECESSITIES',
        allocationPercentage: 50,
        description: 'Essential household and living expenses',
      },
      {
        name: 'Savings',
        jarCode: 'SAVINGS',
        allocationPercentage: 20,
        description: 'Long-term savings and financial reserves',
      },
      {
        name: 'Education',
        jarCode: 'EDUCATION',
        allocationPercentage: 10,
        description: 'Learning and personal development',
      },
      {
        name: 'Enjoyment',
        jarCode: 'ENJOYMENT',
        allocationPercentage: 10,
        description: 'Family leisure and enjoyment',
      },
      {
        name: 'Giving',
        jarCode: 'GIVING',
        allocationPercentage: 10,
        description: 'Gifts, charity, and family support',
      },
    ],
  },
  {
    modelType: FinanceModelType.EIGHTY_TWENTY,
    name: 'Eighty Twenty',
    description: 'Allocate 80% for spending and 20% for savings.',
    jars: [
      {
        name: 'Spending',
        jarCode: 'SPENDING',
        allocationPercentage: 80,
        description: 'Planned family spending',
      },
      {
        name: 'Savings',
        jarCode: 'SAVINGS',
        allocationPercentage: 20,
        description: 'Savings and financial reserves',
      },
    ],
  },
  {
    modelType: FinanceModelType.CUSTOM,
    name: 'Custom',
    description: 'Create and configure family finance jars manually.',
    jars: [],
  },
];
