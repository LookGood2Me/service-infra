import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { VpcComponent } from "./modules/vpc";
import { BastionComponent } from "./modules/bastion";
import { RdsComponent } from "./modules/rds";
import { EksComponent } from "./modules/eks";

const config = new pulumi.Config();

// Pulumi config 값 읽기
const projectName = config.require("projectName");
const vpcCidr = config.require("vpcCidr");
const bastionInstanceType = config.require("bastionInstanceType");
const eksClusterName = config.require("eksClusterName");
const eksNodeGroupName = config.require("eksNodeGroupName");
const eksNodeInstanceType = config.require("eksNodeInstanceType");
const eksNodeDesiredCapacity = config.requireNumber("eksNodeDesiredCapacity");
const eksNodeMaxSize = config.requireNumber("eksNodeMaxSize");
const eksNodeMinSize = config.requireNumber("eksNodeMinSize");
const rdsInstanceType = config.require("rdsInstanceType");
const rdsEngine = config.require("rdsEngine");
const rdsEngineVersion = config.require("rdsEngineVersion");
const rdsUsername = config.require("rdsUsername");
const rdsDbName = config.require("rdsDbName");
const rdsAllocatedStorage = config.requireNumber("rdsAllocatedStorage");
const rdsAllocatedStorageType = config.require("rdsAllocatedStorageType");
const rdsStorageEncrypted = config.requireBoolean("rdsStorageEncrypted");
const rdsPassword = config.requireSecret("rdsPassword");

// 1) VPC 생성
const vpc = new VpcComponent(projectName, {
    cidrBlock: vpcCidr,
});

// 2) Bastion 생성
const bastion = new BastionComponent(
    `${projectName}-bastion`,
    bastionInstanceType,
    {
        vpcId: vpc.vpc.id,
        publicSubnetIds: vpc.publicSubnetIds,
    },
    { dependsOn: [vpc] }
);

// 3) RDS 생성
const rds = new RdsComponent(
    `${projectName}-rds`,
    {
        vpcId: vpc.vpc.id,
        privateSubnetIds: vpc.privateSubnetIds,
        vpcCidr: vpc.vpcCidr,
        instanceType: rdsInstanceType,
        engine: rdsEngine,
        engineVersion: rdsEngineVersion,
        username: rdsUsername,
        password: rdsPassword,
        dbName: rdsDbName,
        allocatedStorage: rdsAllocatedStorage,
        allocatedStorageType: rdsAllocatedStorageType,
        storageEncrypted: rdsStorageEncrypted,
    },
    { dependsOn: [vpc] }
);

// 4) EKS 생성
const eksCluster = new EksComponent(
    eksClusterName,
    {
        vpcId: vpc.vpc.id,
        publicSubnetIds: vpc.publicSubnetIds,
        privateSubnetIds: vpc.privateSubnetIds,
        nodeGroupName: eksNodeGroupName,
        nodeInstanceType: eksNodeInstanceType,
        nodeDesiredCapacity: eksNodeDesiredCapacity,
        nodeMaxSize: eksNodeMaxSize,
        nodeMinSize: eksNodeMinSize,
    },
    { dependsOn: [vpc] }
);

// ▶️ Outputs: Bastion Public IP, RDS Endpoint, EKS Kubeconfig
export const bastionPublicIp = bastion.publicIp;
export const bastionKeyName = bastion.keyName;
export const rdsEndpoint = rds.endpoint;
export const rdsDbUsername = rds.username;
export const rdsDatabaseName = rds.dbName;
export const eksKubeconfig = eksCluster.kubeconfig;