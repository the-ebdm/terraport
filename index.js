import { Command } from 'commander';

import fs from 'fs/promises'
import path from 'path'
import glob from 'glob-promise'

const program = new Command();

import { tfCheck, tfCheckResources, hclToJson } from './lib.js';

program
  .name('terraport')
  .description('CLI to auto import terraform resources into state')
  .version('0.0.1');

program.command('drill')
  .description('Drill down into specific terraform resource/module')
  .option('-p, --planfile <planfile>', 'plan json to parse', 'plan.out')
  .option('-v, --verbose', 'verbose output', false)
  .option('-d, --delete', 'delete resources that already exist', false)
  .option('-o, --onepassword', 'use 1password for secrets', false)
  .option('--output', 'recieve output from script', false)
  .action(async (options) => {
    await tfCheckResources(options.planfile, options)
  });

program.parse();