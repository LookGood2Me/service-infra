// modules/vpc/index.ts

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface VpcArgs {
    cidrBlock: string;
}

export class VpcComponent extends pulumi.ComponentResource {
    public readonly vpc: aws.ec2.Vpc;
    public readonly publicSubnetIds: pulumi.Output<string[]>;
    public readonly privateSubnetIds: pulumi.Output<string[]>;
    public readonly vpcCidr: pulumi.Output<string>;

    constructor(name: string, args: VpcArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:resource:VpcComponent", name, {}, opts);

        // 1) VPC 생성
        this.vpc = new aws.ec2.Vpc(
            `${name}-vpc`,
            {
                cidrBlock: args.cidrBlock,
                enableDnsHostnames: true,
                enableDnsSupport: true,
                tags: { Name: `${name}-vpc` },
            },
            { parent: this }
        );

        // 2) Internet Gateway 생성
        const igw = new aws.ec2.InternetGateway(
            `${name}-igw`,
            {
                vpcId: this.vpc.id,
                tags: { Name: `${name}-igw` },
            },
            { parent: this.vpc }
        );

        // 3) 퍼블릭 라우트 테이블 생성 (모든 퍼블릭 서브넷에서 IGW를 통해 아웃바운드)
        const publicRouteTable = new aws.ec2.RouteTable(
            `${name}-public-rt`,
            {
                vpcId: this.vpc.id,
                routes: [
                    {
                        cidrBlock: "0.0.0.0/0",
                        gatewayId: igw.id,
                    },
                ],
                tags: { Name: `${name}-public-rt` },
            },
            { parent: this.vpc }
        );

        // 4) Availability Zone 3개 가져오기
        const azs = aws.getAvailabilityZones({ state: "available" }).then((r) => r.names.slice(0, 3));

        // 5) 퍼블릭 서브넷 3개, 이와 연결된 라우트 테이블Assoc 생성
        this.publicSubnetIds = pulumi.output(azs).apply((zones) =>
            pulumi.all(
                zones.map((az, idx) => {
                    const publicSubnet = new aws.ec2.Subnet(
                        `${name}-public-subnet-${az}`,
                        {
                            vpcId: this.vpc.id,
                            cidrBlock: pulumi.interpolate`${args.cidrBlock.split(".").slice(0, 2).join(".")}.${idx}.0/24`,
                            availabilityZone: az,
                            mapPublicIpOnLaunch: true,
                            tags: { Name: `${name}-public-subnet-${az}` },
                        },
                        { parent: this.vpc }
                    );

                    new aws.ec2.RouteTableAssociation(
                        `${name}-public-rta-${az}`,
                        {
                            subnetId: publicSubnet.id,
                            routeTableId: publicRouteTable.id,
                        },
                        { parent: publicSubnet }
                    );

                    return publicSubnet.id;
                })
            )
        );

        // 6) Elastic IP 3개 (각 AZ별 NAT Gateway용)
        const eips = Array.from({ length: 3 }).map((_, idx) => {
            return new aws.ec2.Eip(
                `${name}-nat-eip-${idx}`,
                {
                    vpc: true,
                    tags: { Name: `${name}-nat-eip-${idx}` },
                },
                { parent: this.vpc }
            );
        });

        // 7) NAT Gateway 3개 (각 AZ별) 및 프라이빗 라우트 테이블 생성
        this.privateSubnetIds = pulumi
            .all([azs, this.publicSubnetIds])
            .apply(([zones, publicSubnetIds]) =>
                pulumi.all(
                    zones.map((az, idx) => {
                        // a) NAT Gateway 생성 (퍼블릭 서브넷들 중 동일 AZ의 첫 번째 퍼블릭 서브넷에 연결됨)
                        const natGw = new aws.ec2.NatGateway(
                            `${name}-nat-gw-${az}`,
                            {
                                allocationId: eips[idx].id,
                                subnetId: publicSubnetIds[idx],
                                tags: { Name: `${name}-nat-gw-${az}` },
                            },
                            { parent: this.vpc, dependsOn: [eips[idx]] }
                        );

                        // b) 프라이빗 서브넷 생성
                        const privateSubnet = new aws.ec2.Subnet(
                            `${name}-private-subnet-${az}`,
                            {
                                vpcId: this.vpc.id,
                                cidrBlock: pulumi.interpolate`${args.cidrBlock.split(".").slice(0, 2).join(".")}.${idx + 10}.0/24`,
                                availabilityZone: az,
                                tags: { Name: `${name}-private-subnet-${az}` },
                            },
                            { parent: this.vpc }
                        );

                        // c) 프라이빗 라우트 테이블 생성 (각 AZ별 NAT Gateway를 통한 인터넷 액세스)
                        const privateRt = new aws.ec2.RouteTable(
                            `${name}-private-rt-${az}`,
                            {
                                vpcId: this.vpc.id,
                                routes: [
                                    {
                                        cidrBlock: "0.0.0.0/0",
                                        natGatewayId: natGw.id,
                                    },
                                ],
                                tags: { Name: `${name}-private-rt-${az}` },
                            },
                            { parent: this.vpc, dependsOn: [natGw] }
                        );

                        // d) Route Table Association (프라이빗 서브넷 ↔ 해당 프라이빗 라우트 테이블)
                        new aws.ec2.RouteTableAssociation(
                            `${name}-private-rta-${az}`,
                            {
                                subnetId: privateSubnet.id,
                                routeTableId: privateRt.id,
                            },
                            { parent: privateSubnet }
                        );

                        return privateSubnet.id;
                    })
                )
            );

        // 8) VPC CIDR 블록 속성 출력
        this.vpcCidr = this.vpc.cidrBlock;

        this.registerOutputs({
            vpcId: this.vpc.id,
            publicSubnetIds: this.publicSubnetIds,
            privateSubnetIds: this.privateSubnetIds,
            vpcCidr: this.vpcCidr,
        });
    }
}