import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Duration } from "aws-cdk-lib";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
  DomainName,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

export class SubscriberService extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const table = new dynamodb.Table(this, "SubscriberTable", {
      tableName: "SubscriberTable",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "domainName", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    const addSubscriberHandler = new lambda.Function(this, "AddSubscriber", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lib/subscriber"),
      handler: "AddSubscriber.main",
      environment: {
        TABLE: table.tableName
      }
    });

    const confirmSubscriberHandler = new lambda.Function(
      this,
      "ConfirmSubscriber",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("lib/subscriber"),
        handler: "ConfirmSubscriber.main",
        environment: {
          TABLE: table.tableName
        }
      }
    );

    const scrubSubscribersHandler = new lambda.Function(
      this,
      "ScrubSubscribers",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("lib/subscriber"),
        handler: "ScrubSubscribers.main",
        environment: {
          TABLE: table.tableName
        }
      }
    );

    table.grantReadWriteData(addSubscriberHandler);
    table.grantReadWriteData(confirmSubscriberHandler);
    table.grantReadWriteData(scrubSubscribersHandler);

    const certArn =
      "arn:aws:acm:us-east-1:560632727631:certificate/2604ff81-d59b-4a26-942f-d2835a1d77ef";
    const domainName = "api.juniper.camp";
    const domain = new DomainName(this, "DomainName", {
      domainName,
      certificate: acm.Certificate.fromCertificateArn(this, "cert", certArn)
    });

    const httpApi = new HttpApi(this, "SubscriberApi", {
      defaultDomainMapping: {
        domainName: domain
      },
    });

    const addSubscriberIntegration = new HttpLambdaIntegration(
      "AddSubscriberIntegration",
      addSubscriberHandler
    );
    const confirmSubscriberIntegration = new HttpLambdaIntegration(
      "ConfirmSubscriberIntegration",
      confirmSubscriberHandler
    );

    httpApi.addRoutes({
      path: "/subscribe",
      methods: [HttpMethod.PUT, HttpMethod.OPTIONS],
      integration: addSubscriberIntegration
    });

    httpApi.addRoutes({
      path: "/confirm",
      methods: [HttpMethod.POST],
      integration: confirmSubscriberIntegration
    });

    new Rule(this, "ScrubSubscribersRule", {
      schedule: Schedule.rate(cdk.Duration.days(7)),
      targets: [new targets.LambdaFunction(scrubSubscribersHandler)]
    });
  }
}
