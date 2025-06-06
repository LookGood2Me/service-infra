import * as pulumi from "@pulumi/pulumi";
import { VpcComponent } from "./modules/vpc";
import { BastionComponent } from "./modules/bastion";
// import { RdsComponent } from "./modules/rds";
// import { EksComponent } from "./modules/eks";

const config = new pulumi.Config();

// 1) VPC 생성
const vpc = new VpcComponent("main", {
    cidrBlock: "10.0.0.0/16",
});

// 2) Bastion 생성
const bastion = new BastionComponent(
    "bastion",
    {
        vpcId: vpc.vpc.id,
        publicSubnetIds: vpc.publicSubnetIds,
    },
    { dependsOn: [vpc] }
);

// // 3) RDS 생성
// const rds = new RdsComponent(
//     "rds",
//     {
//         vpcId: vpc.vpc.id,
//         privateSubnetIds: vpc.privateSubnetIds,
//         vpcCidr: vpc.vpcCidr,
//     },
//     { dependsOn: [vpc] }
// );

// // 4) EKS 생성
// const eksCluster = new EksComponent(
//     "eks",
//     {
//         vpcId: vpc.vpc.id,
//         publicSubnetIds: vpc.publicSubnetIds,
//         privateSubnetIds: vpc.privateSubnetIds,
//     },
//     { dependsOn: [vpc] }
// );

// ▶️ Outputs: Bastion Public IP, RDS Endpoint, EKS Kubeconfig
export const bastionPublicIp = bastion.publicIp;
export const bastionKeyName = bastion.keyName;
// export const rdsEndpoint = rds.endpoint;
// export const rdsUsername = rds.username;
// export const rdsDatabaseName = rds.dbName;
// export const eksKubeconfig = eksCluster.kubeconfig;