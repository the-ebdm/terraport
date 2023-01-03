import fs from 'fs/promises'
import path from 'path'
import { execa } from 'execa'
import AWS from 'aws-sdk';

AWS.config.update({region: process.env.AWS_DEFAULT_REGION || 'eu-west-1'});

const tfCheck = async (root) => {
  const value = await fs.access(path.join(root, '.terraform')).then(() => true).catch(() => false)

  if (!value) {
    console.error('Terraform is not initialised in this directory. Please run `terraform init` first.')
    process.exit(1)
  }
}

const tfCheckResources = async (planfile, options) => {
  const verbose = options.verbose
  const planFilePath = path.resolve(planfile)
  const planFileExists = await fs.access(planFilePath).then(() => true).catch(() => false)
  const planFileJsonPath = `${planFilePath}.json`
  if(!planFileExists) {
    console.error('No plan file found. Please create a terraform plan json first.')
    process.exit(1)
  }

  // execute terraform show -json plan.out | jq > plan.json
  const show = await execa('terraform', ['show', '-json', planfile])
  const plan = JSON.parse(show.stdout)

  const toCreate = plan.resource_changes.filter((change) => change.change.actions.includes('create'))

  let uncheckableResourceTypes = [];
  let terraformCommands = [];

  toCreate.forEach(async (object) => {
    if(Object.keys(checkableResources).includes(object.type)) {
      if(verbose) console.log(`Checking: ${object.type}.${object.name}`)
      const command = await checkableResources[object.type](object, options)
      console.log(command)
      terraformCommands.push(command)
    } else {
      if(!uncheckableResourceTypes.includes(object.type)) {
        uncheckableResourceTypes.push(object.type)
      }
    }
  })

  if(uncheckableResourceTypes.length > 0 && verbose) {
    console.log('\nThe following resource types are not currently supported:')
    uncheckableResourceTypes.forEach((type) => {
      console.log(`  ${type}`)
    })
  }
}

const checkableResources = {
  aws_iam_role: async (json, options) => {
    const verbose = options.verbose
    const role = json.change.after
    if(role.hasOwnProperty('name')) {
      const iam = new AWS.IAM()
      const params = {
        RoleName: role.name
      }
      const result = await iam.getRole(params).promise().then(() => true).catch(() => false)
      if(result) {
        if(verbose) console.log(`\n${role.name} already exists`)
        if(options.delete) {
          if(verbose) console.log(`\nDeleting ${role.name}`)
          await iam.deleteRole(params).promise()
        } else {
          // Show import commands
          console.log(`Policy ${json.change.after.name} already exists`)
          console.log(`Run the following to import this resource into your state:`)
          if(options.onepassword) {
            console.log(`op run --env-file=.env -- terraform import '${json.address}' ${role.name}`)
          } else {
            console.log(`terraform import '${json.address}' ${role.name}`)
          }
        }
      }
      return result
    }
  },
  aws_iam_policy: async (json, options) => {
    const verbose = options.verbose
    const policy = json.change.after
    if(policy.hasOwnProperty('name')) {
      const arn = `arn:aws:iam::394974394191:policy/${policy.name}`
      const iam = new AWS.IAM()
      try {
        await iam.getPolicy({ PolicyArn: arn }).promise()
        if(options.delete) {
          if(verbose) console.log(`\nPolicy exists. Deleting...`)
          try {
            await iam.deletePolicy({ PolicyArn: arn }).promise()
          } catch (error) {
            console.log(`Error deleting policy: ${arn}`)
            console.error(error);
          }
        } else {
          console.log(`Policy ${policy.name} already exists`)
          console.log(`Run the following to import this resource into your state:`)
          if(options.onepassword) {
            console.log(`op run --env-file=.env -- terraform import '${json.address}' ${arn}`)
          } else {
            console.log(`terraform import '${json.address}' ${arn}`)
          }
        }
      } catch (error) {
        return false
      }
    }
  },
  aws_cloudwatch_log_group: async (json, options) => {
    const verbose = options.verbose
    const logGroup = json.change.after
    if(logGroup.hasOwnProperty('name')) {
      const logGroupName = logGroup.name
      const logs = new AWS.CloudWatchLogs()
      try {
        await logs.describeLogGroups({ logGroupNamePrefix: logGroupName }).promise()
        if(options.delete) {
          if(verbose) console.log(`\nLog group exists. Deleting...`)
          try {
            const output = await logs.deleteLogGroup({ logGroupName }).promise()
            if(verbose) console.log(`Deleted log group: ${logGroupName}`)
          } catch (error) {
            console.log(`Error deleting log group: ${logGroupName}`)
            console.error(error);
          }
        } else {
          console.log(`\nLog group ${logGroupName} already exists`)
          console.log(`Run the following to import this resource into your state:`)
          if(options.onepassword) {
            console.log(`op run --env-file=.env -- terraform import '${json.address}' ${logGroupName}`)
          } else {
            console.log(`terraform import '${json.address}' ${logGroupName}`)
          }
        }
      } catch (error) {
        if(verbose) console.error(error)
        return false
      }
    }
  },
  aws_eks_cluster: async (json, options) => {
    const verbose = options.verbose
    const cluster = json.change.after
    if(cluster.hasOwnProperty('name')) {
      const eks = new AWS.EKS()
      const clusterName = cluster.name
      try {
        await eks.describeCluster({ name: clusterName }).promise()
        if(options.delete) {
          if(verbose) console.log(`\nCluster exists. Deleting...`)
          try {
            const output = await eks.deleteCluster({ name: clusterName }).promise()
            if(verbose) console.log(`Deleted cluster: ${clusterName}`)
          } catch (error) {
            console.log(`Error deleting cluster: ${clusterName}`)
            console.error(error);
          }
        } else {
          console.log(`\nCluster ${clusterName} already exists`)
          console.log(`Run the following to import this resource into your state:`)
          console.log(`op run --env-file=.env -- terraform import '${json.address}' ${clusterName}`)
        }
      } catch (error) {
        return false
      }
    }
  },
  aws_iam_instance_profile: async (json, options) => {
    const verbose = options.verbose
    const instanceProfile = json.change.after
    if(instanceProfile.hasOwnProperty('name')) {
      const iam = new AWS.IAM()
      const instanceProfileName = instanceProfile.name
      try {
        await iam.getInstanceProfile({ InstanceProfileName: instanceProfileName }).promise()
        if(options.delete) {
          if(verbose) console.log(`\nInstance profile exists. Deleting...`)
          try {
            const output = await iam.deleteInstanceProfile({ InstanceProfileName: instanceProfileName }).promise()
            if(verbose) console.log(`Deleted instance profile: ${instanceProfileName}`)
          } catch (error) {
            console.log(`Error deleting instance profile: ${instanceProfileName}`)
            console.error(error);
          }
        } else {
          console.log(`\nInstance profile ${instanceProfileName} already exists`)
          console.log(`Run the following to import this resource into your state:`)
          if(options.onepassword) {
            console.log(`op run --env-file=.env -- terraform import '${json.address}' ${instanceProfileName}`)
          } else {
            console.log(`terraform import '${json.address}' ${instanceProfileName}`)
          }
        }
      } catch (error) {
        return false
      }
    }
  },
  aws_ecr_repository: async (json, options) => {
    const verbose = options.verbose
    const repository = json.change.after
    if(repository.hasOwnProperty('name')) {
      const ecr = new AWS.ECR()
      const repositoryName = repository.name
      try {
        await ecr.describeRepositories({ repositoryNames: [repositoryName] }).promise()
        if(options.delete) {
          if(verbose) console.log(`\nRepository exists. Deleting...`)
          try {
            const output = await ecr.deleteRepository({ repositoryName }).promise()
            if(verbose) console.log(`Deleted repository: ${repositoryName}`)
          } catch (error) {
            console.log(`Error deleting repository: ${repositoryName}`)
            console.error(error);
          }
        } else {
          return outputFunction("Repository", repositoryName, json, options)
        }
      } catch (error) {
        return false
      }
    }
  },
  aws_ecr_lifecycle_policy: async (json, options) => {
    const verbose = options.verbose
    const lifecyclePolicy = json.change.after
    if(lifecyclePolicy.hasOwnProperty('repository')) {
      const ecr = new AWS.ECR()
      const repositoryName = lifecyclePolicy.repository
      try {
        await ecr.getLifecyclePolicy({ repositoryName }).promise()
        if(options.delete) {
          if(verbose) console.log(`\nLifecycle policy exists. Deleting...`)
          try {
            const output = await ecr.deleteLifecyclePolicy({ repositoryName }).promise()
            if(verbose) console.log(`Deleted lifecycle policy: ${repositoryName}`)
          } catch (error) {
            console.log(`Error deleting lifecycle policy: ${repositoryName}`)
            console.error(error);
          }
        } else {
          return outputFunction('Lifecycle policy', repositoryName, json, options)
        }
      } catch (error) {
        return false
      }
    }
  }
}

const outputFunction = (type, name, json, options) => {
  if(options.output) {
    console.log(`\n${type} ${name} already exists`)
    console.log(`Run the following to import this resource into your state:`)
  }
  if(options.onepassword) {
    const command = `op run --env-file=.env -- terraform import '${json.address}' ${name}`
    return command
  } else {
    const command = `terraform import '${json.address}' ${name}`
    return command
  }
}

const hclToJson = async (file) => {
  const { stdout } = await execa('hcl2json --', [file])

  return JSON.parse(stdout)
}

export { tfCheck, tfCheckResources, hclToJson }