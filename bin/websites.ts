#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { JuniperCampStack } from '../lib/junipercamp-stack';
import { SubscriberStack } from '../lib/subscriber-stack';
import { NaturismIsStack } from '../lib/naturismis-stack';

const app = new cdk.App();
const env = {
  account: "560632727631",
  // Stack must be in us-east-1, because the ACM certificate for a
  // global CloudFront distribution must be requested in us-east-1.
  region: "us-east-1"
};

new JuniperCampStack(app, "JuniperCampStack", { env });
new SubscriberStack(app, "JuniperCampSubscriberStack", { env });
new NaturismIsStack(app, "NaturismIsStack", { env });
