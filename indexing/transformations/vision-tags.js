'use strict';

var union = require('lodash/union');
var config = require('collections-online/lib/config');
var cip = require('../../services/cip');
var helpers = require('collections-online/shared/helpers');

const TAGS_VISION_FIELD = helpers.getAssetField('tags_vision');

function saveVisionTags(metadata, tags) {
  if(!TAGS_VISION_FIELD) {
    throw new Error('No vision tag field specified!');
  }
  var values = {};
  values[TAGS_VISION_FIELD] = tags.join(',');
  const view = config.cip.client.constants.layoutAlias;
  return cip.setFieldValues(metadata.catalog, metadata.id, view, values);
}

module.exports = function(state, metadata) {
  // Let's save some cost and bandwidth and not analyze the asset unless
  // explicitly told. As in run only if one of the indexVison args
  // are specified.
  var runForced = state.indexVisionTagsForce;
  var runDefault = state.indexVisionTags && !metadata.tags_vision;

  if ((runForced || runDefault)) {
    // increment the counter so we can keep track on when to pause and slow down
    state.indexVisionTagsPauseCounter++;

    // Still here. Let's grab the image directly from Cumulus.
    let path = 'preview/thumbnail/' + metadata.catalog + '/' + metadata.id;
    let url = cip.generateURL(path);

    // Loading here to prevent circular dependency.
    var motif = require('collections-online/lib/controllers/motif-tagging');

    return motif.fetchSuggestions(url, state.indexVisionTagsAPIFilter)
      .then(function(tags) {
        // Convert tags to a comma seperated string
        // Save the tags to Cumulus
        var tagsIsArray = !!metadata.tags_vision &&
          typeof metadata.tags_vision === 'object' &&
          metadata.tags_vision.constructor === Array;

        if (tagsIsArray === false) {
          metadata.tags_vision = [];
        }
        var oldTagsSize = metadata.tags_vision.length;
        var tagsUnion = union(metadata.tags_vision, tags);
        var diffSize = tagsUnion.length - oldTagsSize;

        // If no new tags was added, we don't save
        if (diffSize === 0) {
          console.log('No new tags found');
          return metadata;
        }

        console.log('Derived', diffSize, 'new tags, using AI.');

        return saveVisionTags(metadata, tagsUnion).then(function(response) {
          if (response.statusCode !== 200) {
            throw new Error('Failed to set the field values');
          }
          metadata.tags_vision = tagsUnion;
          return metadata;
        });
      });
  }
  return metadata;
};
