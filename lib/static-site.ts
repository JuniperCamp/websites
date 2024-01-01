import { CfnOutput } from 'aws-cdk-lib';

import {
  aws_cloudfront as cloudfront,
  aws_iam as iam,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  aws_certificatemanager as acm,
  aws_route53_targets as targets
} from 'aws-cdk-lib';

import { Construct } from 'constructs';

export interface StaticSiteProps {
  domainName: string;
  alternativeNames?: [string];
}

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class StaticSite extends Construct {
  constructor(parent: Construct, name: string, props: StaticSiteProps) {
    super(parent, name);

    const { domainName, alternativeNames = [] } = props;
    const www = 'www.' + domainName;
    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName });
    new CfnOutput(this, 'SiteWithSubDomain', { value: 'https://' + www });

    // OAI access to the S3 website bucket
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'OriginAccessIdentity'
    );

    // Content bucket
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: www,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
    });

    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [siteBucket.bucketArn],
        actions: ['s3:ListBucket'],
        principals: [originAccessIdentity.grantPrincipal],
      })
    );

    new CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });

    // domainName => www.domainName
    const redirectBucket = new s3.Bucket(this, 'RedirectBucket', {
      bucketName: domainName,
      websiteRedirect: {
        hostName: www,
        protocol: s3.RedirectProtocol.HTTPS,
      },
    });

    new CfnOutput(this, 'RedirectedBucket', { value: redirectBucket.bucketName });

    // Route53 alias record for domainName => www.
    new route53.ARecord(this, 'RedirectAliasRecord', {
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.BucketWebsiteTarget(redirectBucket)
      ),
      zone
    });

    for (const alternativeName of alternativeNames) {
      const prefix = alternativeName.split('.').reduce((accumulator, current) => {
        return accumulator + current[0].toUpperCase() + current.substring(1).toLowerCase();
      }, '');

      // alternativeName => domainName
      const altRedirectBucket = new s3.Bucket(this, prefix + 'RedirectBucket', {
        bucketName: alternativeName,
        websiteRedirect: {
          hostName: www,
          protocol: s3.RedirectProtocol.HTTPS,
        },
      });

      new CfnOutput(this, prefix + 'RedirectedBucket', {
        value: altRedirectBucket.bucketName
      });

      // Route53 alias record for alternativeName => www.alternativeName
      new route53.ARecord(this, prefix + 'RedirectAliasRecord', {
        recordName: alternativeName,
        target: route53.RecordTarget.fromAlias(
          new targets.BucketWebsiteTarget(altRedirectBucket)
        ),
        zone: route53.HostedZone.fromLookup(
          this,
          prefix + 'Zone',
          { domainName: alternativeName }
        )
      });
    }

    // TLS certificate
    const { certificateArn } = new acm.Certificate(
      this,
      'SiteCertificate',
      {
        domainName: '*.' + domainName,
        subjectAlternativeNames: [domainName],
        validation: acm.CertificateValidation.fromDns(zone)
      }
    );

    new CfnOutput(this, 'Certificate', { value: certificateArn });

    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      'SiteDistribution',
      {
        viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
          acm.Certificate.fromCertificateArn(
            this,
            'AliasConfigurationCert',
            certificateArn
          ),
          {
            aliases: [www, domainName],
            sslMethod: cloudfront.SSLMethod.SNI,
            securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016
          }
        ),
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: siteBucket,
              originAccessIdentity,
            },
            behaviors: [{ isDefaultBehavior: true }],
          }
        ]
      }
    );
    new CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId
    });

    // Route53 alias record for the CloudFront distribution
    new route53.ARecord(this, 'SiteWithSubdomainAliasRecord', {
      recordName: www,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
      zone
    });

    // Deploy site contents to S3 bucket
    new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [s3deploy.Source.asset('./assets/' + domainName)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*']
    });
  }
}
