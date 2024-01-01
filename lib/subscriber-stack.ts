import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SubscriberService } from './subscriber/SubscriberService';

export class SubscriberStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new SubscriberService(this, 'SubscriberService');
  }
}
