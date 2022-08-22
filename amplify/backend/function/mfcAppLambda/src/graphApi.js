const https = require('https');
const gql = require('graphql-tag');
const graphql = require('graphql');
const axios = require('axios');
const AWS = require('aws-sdk');
const urlParse = require('url').URL;

const API_ID = process.env.API_MFCAPP_GRAPHQLAPIIDOUTPUT;
const API_ENDPOINT = process.env.API_MFCAPP_GRAPHQLAPIENDPOINTOUTPUT;
const API_KEY = process.env.API_MFCAPP_GRAPHQLAPIKEYOUTPUT;
const REGION = process.env.REGION;

const endpoint = new urlParse(API_ENDPOINT).hostname.toString();

const makeRequest = async (query, variables) => {
  console.log({ API_ENDPOINT, API_ID, API_KEY });
  const response = await axios({
    url: API_ENDPOINT,
    method: 'POST',
    headers: {
      'x-api-key': API_KEY
    },
    data: {
      query: graphql.print(query),
      variables,
    },
  });

  return response;
}

const request = async (query, variables) => {
  const req = new AWS.HttpRequest(API_ENDPOINT, REGION);

  req.method = 'POST';
  req.path = '/graphql';
  req.headers.host = endpoint;
  req.headers["Content-Type"] = "application/json";
  req.body = JSON.stringify({
    query,
    variables,
  });
  const signer = new AWS.Signers.V4(req, 'appsync', true);
  signer.addAuthorization(AWS.config.credentials, AWS.util.date.getDate());

  const data = await new Promise((resolve, reject) => {
    const request = https.request({ ...req, host: endpoint }, (result) => {
      let data = '';

      result.on('data', (chunk) => {
        data += chunk;
      });

      result.on('end', () => {
        resolve({
          statusCode: result.statusCode,
          data: JSON.parse(data.toString()),
        });
      });

      result.on('error', (err) => {
        reject(err);
      });
    });
    request.write(req.body);
    request.end();
  });
  return data;
}

const hasData = (response) => {
  return response && response.data && response.data.data;
}

const hasError = (response) => {
  return response && response.data && response.data.errors && response.data.errors.length > 0
}

const toErrorMessage = (response) => {
  return response.data.errors.map(error => error.message).reduce((msg, err) => msg += "\n" + err);
}

const getCourse = async (id) => {
  const courseQuery = `
  query getCourse {
      getCourse(id: "${id}") {
          id
          name
          accessGroup
          modules {
            items {
              id
              index
              delayNumber
              delayUOM
            }
          }
      }
  }
  `
  const response = await request(courseQuery);
  if (hasData(response)) {
    return response.data.data.getCourse;
  }
  if (hasError(response)) {
    throw Error(toErrorMessage(response));
  }
}

const getProgramByProductId = async (productId) => {
  const programQuery = `
  query listProgram {
    listPrograms(filter: {productStoreId: {eq: "${productId}"}}) {
      items {
        id
      }
    }
  }
  `
  const response = await request(programQuery);
  if (hasError(response)) {
    console.log(response.data.errors);
    throw Error(toErrorMessage(response));
  }
  if (hasData(response)) {
    return response.data.data.listPrograms.items[0];
  }
}

const createEnrollment = async (cognitoId, courseId, enrolledAt) => {
  const enrollmentMutation = `
    mutation enrollUser($input: CreateEnrollmentInput!) {
        createEnrollment(input: $input) {
            id
        }
    }
    `
  const input = {
    cognitoId,
    courseId,
    enrolledAt,
  };
  const response = await request(enrollmentMutation, { input });
  console.log(response);
  if (hasData(response)) {
    return response.data.data.createEnrollment;
  }
  if (hasError(response)) {
    throw Error(toErrorMessage(response));
  }
}

const createModuleProgress = async (owner, moduleId, enrollmentId, availableAt) => {
  const progressMutation = `
  mutation createModuleProgress($input: CreateModuleProgressInput!) {
    createModuleProgress(input: $input) {
      id
    }
  }
  `
  const input = {
    owner,
    moduleId,
    enrollmentId,
    availableAt,
  }
  const response = await request(progressMutation, { input });
  if (hasData(response)) {
    return response.data.data.createModuleProgress;
  }
  if (hasError(response)) {
    throw Error(toErrorMessage(response));
  }
}

const createUser = async (cognitoId, email, firstName, lastName) => {
  const profileMutation = `
  mutation createProfile($input: CreateProfileInput!) {
    createProfile(input: $input) {
      id
    }
  }
  `
  const input = {
    cognitoId,
    email,
    firstName,
    lastName
  };
  const response = await request(profileMutation, { input });
  if (hasData(response)) {
    return response.data.data.createProfile;
  }
  if (hasError(response)) {
    throw Error(toErrorMessage(response));
  }
}

const createMembership = async(user, programId) => {
  const memberships = `
  query listMemberships {
    listMemberships(filter: {and: {programId: {eq: "e89e45b2-a825-4d40-bdd1-f6d8fbe39c6e	"}, cognitoId: {eq: "rcoosterloo"}}}) {
      nextToken
      items {
        id
      }
    }
  }
  `;
  const qResponse = await request(memberships);
  if(hasData(qResponse) && qResponse.data.data.listMemberships != null
    && qResponse.data.data.listMemberships.items != null && qResponse.data.data.listMemberships.items.length > 0) {
      return true;
  }
  const membershipMutation = `
  mutation createMembership($input: CreateMembershipInput!) {
    createMembership(input: $input) {
      id
    }
  }
  `;
  const input = {
    cognitoId: user,
    programId,
  };

  const response = await request(membershipMutation, { input });
  if(hasData(response)) {
    return response.data.data.createMembership;
  } else {
    return Error(toErrorMessage(repsonse));
  }
}

module.exports = {
  createEnrollment,
  createModuleProgress,
  createUser,
  getCourse,
  createMembership,
  getProgramByProductId,
}