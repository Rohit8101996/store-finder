const _ = require('lodash');
const helper = require('./helper');


module.exports.firstRun = async(event, context) => {

  try {
    // Await the result of getData, which returns a promise
    const data = await helper.getData();

    // Ensure data.Items exists before using it
    if (data && data.Items) {

      //The problem in the code lies in the use of await inside the _.forEach loop. 
      //The _.forEach function from Lodash is not designed to work with asynchronous functions.
      // You can't use await directly inside a synchronous loop like forEach 
      // so commented foreach loop instead used for of 
      // _.forEach(data.Items, (location) => {
      //   console.log("Starting state machine for this locationId" + location.locationId);
      //   const result = await helper.startStateMachine(location);
      //   console.log(result);
      // });

      for (const location of data.Items) {
        console.log("Starting state machine for this locationId " + location.locationId);
        
        // Await the result of the state machine start
        const result = await helper.startStateMachine(location);
        console.log(result);
      }

      // one other approach for async invokation is , this is faster than above
      // const results = await Promise.all(
      //   data.Items.map(async (location) => {
      //     console.log("Starting state machine for this locationId " + location.locationId);
      //     return await helper.startStateMachine(location);
      //   })
      // );
      //console.log(results);
    } else {
      console.log('No items found in the DynamoDB table.');
    }
    
  } catch (err) {
    console.error("Error in firstRun:", err);
  }

};

module.exports.findGeoCode = async (event, context) => {

  const location = event;
  const addressText = `${location.line1}, ${location.city}, ${location.zipCode}`;

  try {
    const geoCodes = await helper.findGeoCodeFromAddressText(addressText);
    console.log(geoCodes);
    //for algolia keeping default search is true, searchable field is required by algolia 
    location.searchable = true;
      if(_.isEmpty(geoCodes)){
         location.searchable = false;
         location.message = `location with ${location.locationId} geocodes not found, hereby not pushed to algolia`;
         console.log('No geo code found.');
      } else {
        //This is for algolia, add geocodes to location object
        //underscore with startingname is for algolia
        location._geoloc = {
          lat: geoCodes.lat,
          lng: geoCodes.lng
        }
      }
      return location;
  }
  catch(err) {
    console.error("Error in findGeoCode:", err);
  }
};

module.exports.pushToAlgolia = async (event, context) => {
  const location = event;
  location.objectID = event.locationId;
  try {
    const result = await helper.pushToAlgolia(location);
    result.message = `location with ${event.locationId} pushed to Algolia`;
    return result;
  } catch(err) {
    console.error("Error in pushToAlgolia" , err);
  }
};

module.exports.sendToSlack = async (event, context) => {
  try {
    const message = event.message;
    const result = await helper.sendToSlack(message); 
  } catch(err) {
    console.error("Error in sendToSlack");
  }
};

module.exports.processUpdates = async (event, context) => {

  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      console.log(event);
      const data = record.dynamodb.NewImage;
      console.log(data);
      const location = {
        "locationId": data.locationId.S,
        "line1": data.line1.S,
        "line2": data.line2.S,
        "city": data.city.S,
        "state": data.state.S,
        "country": data.country.S,
        "zipCode": data.zipCode.S
      };
      console.log("Starting state machine for this locationId " + location.locationId);

      try {
        // Await the result of the state machine start
        const result = await helper.startStateMachine(location);
        console.log(result);
      } catch (err) {
        console.error("Error starting state machine:", err);
      }
    }
    else if (record.eventName === 'MODIFY') {
      // Handle MODIFY event
      const oldData = record.dynamodb.OldImage;
      const newData = record.dynamodb.NewImage;

      const oldLocation = {
        "locationId": oldData.locationId.S,
        "line1": oldData.line1.S,
        "line2": oldData.line2.S,
        "city": oldData.city.S,
        "state": oldData.state.S,
        "country": oldData.country.S,
        "zipCode": oldData.zipCode.S
      };

      const newLocation = {
        "locationId": oldData.locationId.S,
        "line1": newData.line1.S,
        "line2": newData.line2.S,
        "city": newData.city.S,
        "state": newData.state.S,
        "country": newData.country.S,
        "zipCode": newData.zipCode.S
      };

      console.log(`Location modified for ${newLocation.locationId}`);
      console.log("Old Location:", oldLocation);
      console.log("New Location:", newLocation);

      try {
        // You can start another state machine or do some updates with the new data
        const result = await helper.startStateMachine(newLocation);
        console.log(result);
      } catch (err) {
        console.error("Error updating state machine for MODIFY event:", err);
      }
    }
    else if (record.eventName === 'REMOVE') {

      try {
      // Handle REMOVE event
      console.log(event);
      const data = record.dynamodb.OldImage;
      const locationId = data.locationId.S;
      const result = await helper.removeFromAlgolia(locationId);
      result.message = `entry deleted: ${result.objectID} from algolia`;
      console.log(result);
      const result2 = await helper.sendToSlack(result.message);
      } catch (err) {
        console.error("Error in deleting algolia records", err);
        //const result2 = await helper.sentToSlack(err);
      }

    }
  }
}

//http://www.someurl.com/location?address=9779
module.exports.findLocations = async (event,context) => {
  console.log(event);
  try {
  const address = event.queryStringParameters.address;
  //so now to get results from algolia we need to get geocode 
  // then we need to pass geocode to algolia for search.
  //Requirements from algolia that for location based search we need to defined lat lng in one object i.e., _geoloc i.e., algolia's requirement for location based search 
  //now when we give geoloc algolia computes internally closest latlng results and return back , we dont need to take care of it 
  //https://www.algolia.com/doc/guides/managing-results/refine-results/geolocation/#enabling-geo-search-by-adding-geolocation-data-to-records

  const geoCodes = await helper.findGeoCodeFromAddressText(address);
  if(_.isEmpty(geoCodes)){
    const response = {
      statusCode : 400,
      body : 'Invalid ADDRESS'
    };
    return response;
 }
  const results = await helper.searchAlgolia(geoCodes);
  const response = {
    statusCode : 200,
    body : JSON.stringify(results)
  };
  return response;
  }
  catch(err){
    console.error("Error in findLocations", err);
    const response = {
      statusCode : 500,
      body : 'Internal server error' + err
    };
    return response;
  }
}

//for dynamo db triggers 
// module.exports.processUpdates = async (event, context) => {

//   event.Records.forEach(record => {
//     if(record.eventName === 'INSERT') {
//       const data = record.dynamodb.NewImage;
//       const location = {
//         "locationId": data.id.S,
//         "line1": data.line1.S,
//         "line2": data.line2.S,
//         "city": data.city.S,
//         "state": data.state.S,
//         "country": data.country.S,
//         "zipCode": data.zipCode.S
//       };
//       console.log("Starting state machine for this locationId " + location.locationId);
        
//       // Await the result of the state machine start
//       // This line does not work because forEach is expects syncronous event. const result = await helper.startStateMachine(location);
//       console.log(result);
    
//     else if(record.eventName === 'MODIFY') {

//     }
//     else if(record.eventName === 'REMOVE') {

//     }
//   });
// }

// module.exports.findGeoCode = async (event, context) => {

//   const location = event;
//   const addressText = `${location.line1}, ${location.city}, ${location.zipCode}`;

//   try {
//     const geoCodes = await helper.findGeoCodeFromAddressText(addressText);
//     console.log(geoCodes);
//       if(_.isEmpty(geoCodes)){
//          console.log('No geo code found.');
//       }
//       return geoCodes;
//   }
//   catch(err) {
//     console.error("Error in findGeoCode:", err);
//   }
// }

//use serverless deploy function -f firstRun to dploy function without serverless.yml changes 
















//below both are fine

// module.exports.firstRun = async (event, context) => {

//   console.log('Event:', event);
//   console.log('Context:', context);
  
//   return {
//     statusCode: 200,
//     body: JSON.stringify({ message: 'hello' }),
//   };

//   // Use this code if you don't use the http event with the LAMBDA-PROXY integration
//   // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
// };


// module.exports.firstRun = async (event) => {

//   console.log('Event:', event);
  
//   return {
//     statusCode: 200,
//     body: JSON.stringify({ message: 'hello' }),
//   };

//   // Use this code if you don't use the http event with the LAMBDA-PROXY integration
//   // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
// };

