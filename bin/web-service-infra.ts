#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Web1ServiceInfraStack } from '../lib/web1-service-infra-stack';
import { Web3ServiceInfraStack } from '../lib/web3-service-infra-stack';

const env = { account: '999999999999', region: 'ap-northeast-1' };
const app = new cdk.App();
new Web1ServiceInfraStack(app, 'Web1ServiceInfraStack', {env: env});
new Web3ServiceInfraStack(app, 'Web3ServiceInfraStack', {env: env});
