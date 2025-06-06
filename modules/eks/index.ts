import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";

export interface EksArgs {
    vpcId: pulumi.Input<string>;
    publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
    privateSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
    nodeGroupName: pulumi.Input<string>;
    nodeInstanceType: pulumi.Input<string>;
    nodeDesiredCapacity: pulumi.Input<number>;
    nodeMaxSize: pulumi.Input<number>;
    nodeMinSize: pulumi.Input<number>;
}

export class EksComponent extends pulumi.ComponentResource {
  public readonly kubeconfig: pulumi.Output<any>;

  constructor(name: string, args: EksArgs, opts?: pulumi.ComponentResourceOptions) {
    super("custom:resource:EksComponent", name, args, opts);

    // NodeGroup
    const cluster = new eks.Cluster(`${name}-cluster`, {
      vpcId: args.vpcId,
      publicSubnetIds: args.publicSubnetIds,
      privateSubnetIds: args.privateSubnetIds,
      instanceType: args.nodeInstanceType,
      desiredCapacity: args.nodeDesiredCapacity,
      minSize: args.nodeMinSize,
      maxSize: args.nodeMaxSize,
      tags: { Name: `${name}-cluster` },
    }, { parent: this });

    this.kubeconfig = cluster.kubeconfig;

    this.registerOutputs({
      kubeconfig: this.kubeconfig,
    });
  }
}