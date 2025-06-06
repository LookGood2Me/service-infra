import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface RdsArgs {
    vpcId: pulumi.Input<string>;
    privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
    vpcCidr: pulumi.Input<string>;
    instanceType: pulumi.Input<string>;
    engine: pulumi.Input<string>;
    engineVersion: pulumi.Input<string>;
    username: pulumi.Input<string>;
    password: pulumi.Input<string>;
    dbName: pulumi.Input<string>;
    allocatedStorage: pulumi.Input<number>;
    allocatedStorageType: pulumi.Input<string>;
    storageEncrypted: pulumi.Input<boolean>;
}

export class RdsComponent extends pulumi.ComponentResource {
    public readonly endpoint: pulumi.Output<string>;
    public readonly username: pulumi.Output<string>;
    public readonly dbName: pulumi.Output<string>;

    constructor(name: string, args: RdsArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:resource:RdsComponent", name, {}, opts);

        // 1) 서브넷 그룹 생성 (RDS는 private subnet 3개에 걸쳐야 함)
        const subnetGroup = new aws.rds.SubnetGroup(
            `${name}-subnetgroup`,
            {
                subnetIds: args.privateSubnetIds,
                tags: { Name: `${name}-subnetgroup` },
            },
            { parent: this }
        );

        // 2) Security Group: DB 포트(VPC 내부에서만 접속 허용)
        const rdsSg = new aws.ec2.SecurityGroup(
            `${name}-sg`,
            {
                vpcId: args.vpcId,
                description: `Allow ${args.engine} traffic from within VPC`,
                ingress: [
                    {
                        protocol: "tcp",
                        fromPort: 3306, // MySQL 포트
                        toPort: 3306,
                        cidrBlocks: [args.vpcCidr],
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

        // 3) RDS Instance 생성
        const db = new aws.rds.Instance(
            `${name}-instance`,
            {
                engine: args.engine,
                engineVersion: args.engineVersion,
                instanceClass: args.instanceType,
                allocatedStorage: args.allocatedStorage,
                storageType: args.allocatedStorageType,
                storageEncrypted: args.storageEncrypted,
                dbSubnetGroupName: subnetGroup.id,
                vpcSecurityGroupIds: [rdsSg.id],
                skipFinalSnapshot: true,
                publiclyAccessible: false,
                dbName: args.dbName, // name -> dbName 으로 변경 (deprecation warning 해결)
                username: args.username,
                password: args.password,
                multiAz: false,
                port: 3306, // MySQL 포트
                tags: { Name: `${name}-instance` },
            },
            { parent: this }
        );

        this.endpoint = db.endpoint;
        this.username = pulumi.output(args.username);
        this.dbName = pulumi.output(args.dbName);

        this.registerOutputs({
            endpoint: this.endpoint,
            username: this.username,
            dbName: this.dbName,
        });
    }
}