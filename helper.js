
const AWS = require('aws-sdk');
const axios = require('axios');
const {algoliasearch} = require('algoliasearch');
const algoliaClient = algoliasearch('YourApplicationID', 'YourAdminAPIKey');


const SlackWebhook = require('slack-webhook');
const slack = new SlackWebhook('https://hooks.slack.com/some-dummy-url');



// const googleApiClient = require('@google/maps').createClient({
//   key : 'example-key'
// })

const docClient = new AWS.DynamoDB.DocumentClient();
const goMapsApiKey = 'dummy-api-key-of-go-maps';


exports.getData = async () => {
  const param = {
    TableName: 'location-list',
  };

  try {
    const data = await docClient.scan(param).promise();
    console.log(data);
    return data; // Return the data so it can be accessed in the calling function dont return after catch block it might be 
  } catch (err) {
    console.error("Error scanning DynamoDB:", err);
    throw err; // Rethrow the error to be handled in the calling function
  }
};

// exports.findGeoCode = async (addressText) => {
//   addressText = "317 BROADWAY, New York, NY, 10007";
//   try {
//     const response = await googleApiClient.geoCode({
//       address : addressText
//      });
//      console.log(response);
//      const geometry = response.json.results[0].geometry;
//      return geometry.location;
//   } catch(err) {
//     console.log(err);
//   }
// }

exports.findGeoCodeFromAddressText = async (addressText) => {
  const url = `https://maps.gomaps.pro/maps/api/geocode/json?address=${encodeURIComponent(addressText)}&key=${goMapsApiKey}`;
  try {
    const response = await axios.get(url);
    if (response.data && response.data.results && response.data.results.length > 0) {
      // If the API returns a result, log the geocode
      console.log(response.data.results[0].geometry.location);
      return response.data.results[0].geometry.location;
    } else {
      console.log("No results found for the given address.");
    }
  } catch (err) {
    console.log("Requesting URL:", url);
    console.error("Error fetching geocode:", err);
  }
};

exports.startStateMachine = async (location) => {
  console.log("inside start state machine method");
  const stepfunctions = new AWS.StepFunctions();
  const params = {
    stateMachineArn : 'arn:aws:states:region:account-number:stateMachine:step-function-name',
   // stateMachineArn: 'arn:aws:states:region:account-number:stateMachine:step-function-name', updated
   //get arn post step function creation
    input: JSON.stringify(location)
  };
  try {
    console.log("before step function start");
    const result = await stepfunctions.startExecution(params).promise();
    console.log(result);
    return result;
  }
  catch (err) {
    console.log("Error starting step fnction", err);
  }
}

exports.pushToAlgolia = async (location) => {
  try {
    const result =  await algoliaClient.saveObject({ indexName: 'locations', body: location }); //indexName is nothing but table creation in algolia, body is object we want to save
    console.log('Location added/updated:', result);
    return result;
  } 
  catch (err) {
    console.error('Error adding/updating Locations:', err);
  }
  // index
  // .saveObjects({ indexName: 'locations', body: location })
  // .then(({ objectIDs }) => {
  //   console.log('Objects added/updated:', objectIDs);
  // })
  // .catch((err) => {
  //   console.error('Error adding objects:', err);
  // });
  //above one is method chaining it also works well
}


exports.sendToSlack = async message => {
  try {
    const result = await slack.send(message);
    return result;
  }
  catch(err) {
    console.log(err);
  }
}

exports.removeFromAlgolia = async (locationId) => {
  try {
  const result = await algoliaClient.deleteObject({ indexName: 'locations', objectID: locationId });
  console.log('Location removed:', result);
  return result;
  } catch(err) {
    console.log(err);
  }
}

exports.searchAlgolia = async (geoCodes) => {
  try {
        // const result = await algoliaClient.search({
        //                         aroundLatLng: `${geoCodes.lat}, ${geoCodes.lng}`,
        //                         aroundRadius: 7000 // 5 miles
        //                       });
        //           console.log(result);
        //console.log(algoliaClient);
        //abov one is older version supported by algolia not supported in 5 and above
        const { results } = await algoliaClient.search({
          requests: [
            { 
              indexName: 'locations' , 
              aroundLatLng: `${geoCodes.lat},${geoCodes.lng}`,
              aroundRadius: 7000, // Radius in meters (5 miles)
              hitsPerPage: 5 
            }
          ]
        });
        console.log(JSON.stringify(results));
        return results;
  } catch(err) {
    console.log("Error Search Algolia", err);
  }
}


// exports.findGeoCodeFromAddressText = async (addressText) => {
//   addressText = "317 BROADWAY, New York, NY, 10007";
//   const url = `https://maps.gomaps.pro/maps/api/geocode/json?address=${encodeURIComponent(addressText)}&key=${goMapsApiKey}`;
//   try {
//     const response = await axios.get(url);   
//     if (response.data && response.data.results && response.data.results.length > 0) {
//       // If the API returns a result, log the geocode
//       console.log("Geocode response:", response.data.results[0].geometry.location);
//     } else {
//       console.log("No results found for the given address.");
//     }
//   } catch (err) {
//     console.log("Requesting URL:", url);
//     console.error("Error fetching geocode:", err);
//   }
// };
//this.findGeoCodeFromAddressText(); for testing this method 