// modules/bastion/index.ts

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface BastionArgs {
    vpcId: pulumi.Input<string>;
    publicSubnetIds: pulumi.Input<string[]>;
}

export class BastionComponent extends pulumi.ComponentResource {
    public readonly instanceId: pulumi.Output<string>;
    public readonly publicIp: pulumi.Output<string>;
    public readonly keyName: pulumi.Output<string>;

    constructor(name: string, instanceType: string, args: BastionArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:resource:BastionComponent", name, {}, opts);

        const bastionSg = new aws.ec2.SecurityGroup(
            `${name}-sg`,
            {
                vpcId: args.vpcId,
                description: "Allow SSH from internet",
                ingress: [
                    {
                        protocol: "tcp",
                        fromPort: 22,
                        toPort: 22,
                        cidrBlocks: ["0.0.0.0/0"],
                    },
                ],
                egress: [
                    {
                        protocol: "-1",
                        fromPort: 0,
                        toPort: 0,
                        cidrBlocks: ["0.0.0.0/0"],
                    },
                ],
                tags: { Name: `${name}-sg` },
            },
            { parent: this }
        );

        // 2) Keypair 설정을 위해 Pulumi Config에서 미리 저장된 public key 
        const config = new pulumi.Config();
        const publicKey = config.requireSecret("bastionPublicKey");

        // 3) Key Pair 생성 (publicKey는 config에서 가져온 값)
        const keyPair = new aws.ec2.KeyPair(
            `${name}-keypair`,
            {
                keyName: `${name}-keypair`,
                publicKey: publicKey,
            },
            { parent: this }
        );

        // 4) Bastion EC2 인스턴스 생성
        //    - Amazon Linux 2 AMI 자동 검색
        const ami = aws.ec2.getAmi(
            {
                filters: [
                    { name: "name", values: ["amzn2-ami-hvm-*-x86_64-gp2"] },
                    { name: "state", values: ["available"] },
                ],
                owners: ["137112412989"], // Amazon
                mostRecent: true,
            },
            { async: true }
        );

        const bastionInstance = new aws.ec2.Instance(
            `${name}-instance`,
            {
                ami: ami.then((a: aws.ec2.GetAmiResult) => a.id),
                instanceType: instanceType,
                subnetId: pulumi.output(args.publicSubnetIds).apply((ids: string[]) => ids[0]), // 첫 번째 퍼블릭 서브넷 선택
                keyName: keyPair.keyName,
                vpcSecurityGroupIds: [bastionSg.id],
                associatePublicIpAddress: true,
                tags: { Name: `${name}-instance` },
            },
            { parent: this }
        );

        // 5) Elastic IP 생성 및 Bastion EC2에 연결
        const eip = new aws.ec2.Eip(
            `${name}-eip`,
            {
                instance: bastionInstance.id,
                domain: "vpc", // vpc: true 대신 domain: 'vpc' 사용
                tags: { Name: `${name}-eip` },
            },
            { parent: bastionInstance }
        );

        this.instanceId = bastionInstance.id;
        this.publicIp = eip.publicIp;
        this.keyName = keyPair.keyName;

        this.registerOutputs({
            instanceId: this.instanceId,
            publicIp: this.publicIp,
            keyName: this.keyName,
        });
    }
}