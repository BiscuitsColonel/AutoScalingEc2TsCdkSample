import * as cdk from '@aws-cdk/core'
import * as autoscaling from '@aws-cdk/aws-autoscaling'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2'
import * as iam from '@aws-cdk/aws-iam'
import * as logs from '@aws-cdk/aws-logs'
import * as assets from '@aws-cdk/aws-s3-assets'
import * as acm from '@aws-cdk/aws-certificatemanager'
import * as fs from 'fs'
import * as path from 'path'

export class Web3ServiceInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const ProjectName = 'web3'
    const Environment = 'prd'
    const Key = 'init'
    const Itype = 'c3.xlarge'
    const iamArn =
      'arn:aws:iam::999999999999:instance-profile/ec2-role'
    const myVpc = 'vpc-xxxxxxxx'
    const mySg = ['sg-aaaaaaaa', 'sg-bbbbbbbb', 'sg-cccccccc']
    const certificateArn =
      'arn:aws:acm:ap-northeast-1:999999999999:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxx'
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);
    
    const vpc = ec2.Vpc.fromLookup(this, `${ProjectName}-${Environment}-vpc`, {
      vpcId: myVpc,
    })

    const subnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC, onePerAz: true })

    const asset = new assets.Asset(this, 'BundledAsset', {
      path: path.join(__dirname, 'userdata-web3'),
      bundling: {
        image: cdk.DockerImage.fromRegistry('alpine'),
        command: [
          'sh', '-c', `
            sh create-userdata.sh
            chmod 755 userdata.sh
            mv userdata.sh /asset-output/
          `
        ],
        outputType: cdk.BundlingOutput.NOT_ARCHIVED
      },
    });

    const userData = ec2.UserData.forLinux()

    userData.addCommands(
      fs
        .readFileSync('./lib/userdata/execute-userdata.sh', 'utf8')
        .replace('S3Bucket', asset.s3ObjectUrl)
        .replace('/_S3Object_/g', asset.s3ObjectKey),
    )

    const asg = new autoscaling.AutoScalingGroup(
      this,
      `${ProjectName}-${Environment}-asg`,
      {
        autoScalingGroupName: `${ProjectName}-${Environment}-asg`,
        instanceType: new ec2.InstanceType(Itype),
        keyName: Key,
        machineImage: ec2.MachineImage.latestAmazonLinux({
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
          cachedInContext: true,
        }),
        role: iam.Role.fromRoleArn(
          this,
          `${ProjectName}-${Environment}-iam`,
          iamArn,
        ),
        userData: userData,
        maxCapacity: 2,
        minCapacity: 2,
        vpc: vpc,
        vpcSubnets: subnets,
        associatePublicIpAddress: true,
        cooldown: cdk.Duration.minutes(5),
        healthCheck: autoscaling.HealthCheck.elb({
          grace: cdk.Duration.minutes(15),
        }),
        desiredCapacity: 2,
        newInstancesProtectedFromScaleIn: false,
      },
    )

    asset.grantRead(asg)
    cdk.Tags.of(asg).add('Name', `${ProjectName}-${Environment}-ec2`)
    cdk.Tags.of(asg).add(
      'hoge-integration',
      'Frontend-prd:web/Production:web',
    )
    cdk.Tags.of(asg).add('hoge-enable', 'true')

    const alb = new elbv2.ApplicationLoadBalancer(
      this,
      `${ProjectName}-${Environment}-alb`,
      {
        internetFacing: true,
        loadBalancerName: `${ProjectName}-${Environment}-alb`,
        vpc: vpc,
        vpcSubnets: subnets,
      },
    )

    for (let index = 0; index < mySg.length; index++) {
      alb.addSecurityGroup(
        ec2.SecurityGroup.fromSecurityGroupId(this, mySg[index], mySg[index], {
          mutable: false,
        }),
      )
    }

    cdk.Tags.of(alb).add('Name', `${ProjectName}-${Environment}-alb`)
    cdk.Tags.of(alb).add(
      'hoge-integration',
      'Frontend-prd:elb/Production:elb',
    )
    cdk.Tags.of(alb).add('hoge-enable', 'true')

    const tg443 = new elbv2.ApplicationTargetGroup(
      this,
      `${ProjectName}-${Environment}-tg443`,
      {
        targetGroupName: `${ProjectName}-${Environment}-tg443`,
	targets: [asg],
        healthCheck: {
          healthyHttpCodes: '200',
          healthyThresholdCount: 2,
          interval: cdk.Duration.seconds(30),
          path: '/health/index.html',
          timeout: cdk.Duration.seconds(5),
          unhealthyThresholdCount: 2,
        },
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: vpc,
        slowStart: cdk.Duration.seconds(900),
      },
    )

    alb.addListener(`${ProjectName}-${Environment}-lsn443`, {
      certificates: [certificate],
      defaultTargetGroups: [tg443],
      open: true,
      port: 443,
    })

    const tg80 = new elbv2.ApplicationTargetGroup(
      this,
      `${ProjectName}-${Environment}-tg80`,
      {
        targetGroupName: `${ProjectName}-${Environment}-tg80`,
        healthCheck: {
          healthyHttpCodes: '200',
          healthyThresholdCount: 2,
          interval: cdk.Duration.seconds(30),
          path: '/health/index.html',
          timeout: cdk.Duration.seconds(5),
          unhealthyThresholdCount: 2,
        },
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        vpc: vpc,
        slowStart: cdk.Duration.seconds(900),
      },
    )

    alb.addListener(`${ProjectName}-${Environment}-lsn80`, {
      defaultTargetGroups: [tg80],
      open: true,
      port: 80,
    })

    const cfnAsg = asg.node.defaultChild as autoscaling.CfnAutoScalingGroup
    cfnAsg.targetGroupArns = [tg443.targetGroupArn, tg80.targetGroupArn]

    const logGroup = new logs.LogGroup(
      this,
      `${ProjectName}-${Environment}-logGroup`,
      {
        logGroupName: '/ec2/' + Environment + '/' + ProjectName,
        retention: logs.RetentionDays.INFINITE,
      },
    )
  }
}
