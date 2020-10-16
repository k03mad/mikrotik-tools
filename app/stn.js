#!/usr/bin/env node
/* eslint-disable sonarjs/no-duplicate-string */

'use strict';

const log = require('./utils/log');
const {arg} = require('../env');
const {mikrotik, print} = require('utils-mad');

/**
 * @param {Array} data
 * @param {string} name
 * @param {string} key
 * @returns {object}
 */
const findRule = (data, name = 'station', key = 'comment') => data
    .find(elem => (elem[key] || '').includes(name));

/**
 * @param {Array} data
 * @param {string} name
 * @param {string} key
 * @returns {object}
 */
const getIdString = (data, name, key) => `=.id=${findRule(data, name, key)['.id']}`;

(async () => {
    try {
        const [bridge, wifi, list, dhcp, ether, profiles] = await mikrotik.write([
            ['/interface/bridge/port/print'],
            ['/interface/wireless/print'],
            ['/interface/list/member/print'],
            ['/ip/dhcp-client/print'],
            ['/interface/ethernet/print'],
            ['/interface/wireless/security-profiles/print'],
        ]);

        const stationComment = findRule(wifi).comment;

        const id = {
            profiles: getIdString(profiles, 'station', 'name'),
            wifi: getIdString(wifi),
            bridge: getIdString(bridge),
            ether: getIdString(ether, 'wan1', 'name'),
            list: getIdString(list),
            dhcp: getIdString(dhcp),
        };

        if (arg) {
            const [, stationName] = stationComment.match(/station:(\w+)/);
            const [, spotsString] = stationComment.match(/station:\w+ \[(.+)]/);

            const spots = spotsString
                .split('; ')
                .map(elem => {
                    const [name, password, auth, ciphers] = elem.split(':');
                    return {name, password, auth, ciphers};
                });

            const spot = spots[Number(arg) - 1];

            if (!spot) {
                throw new Error(`No spot num ${arg}`);
            }

            await mikrotik.write([
                ['/ip/cloud/set', '=ddns-enabled=no'],

                ['/interface/wireless/security-profiles/set', id.profiles, `=authentication-types=${spot.auth}`],
                ['/interface/wireless/security-profiles/set', id.profiles, `=unicast-ciphers=${spot.ciphers}`],
                ['/interface/wireless/security-profiles/set', id.profiles, `=group-ciphers=${spot.ciphers}`],
                ['/interface/wireless/security-profiles/set', id.profiles, `=wpa-pre-shared-key=${spot.password}`],
                ['/interface/wireless/security-profiles/set', id.profiles, `=wpa2-pre-shared-key=${spot.password}`],

                ['/interface/wireless/set', id.wifi, '=security-profile=station'],
                ['/interface/wireless/set', id.wifi, '=mode=station'],
                ['/interface/wireless/set', id.wifi, `=name=${stationName}`],
                ['/interface/wireless/set', id.wifi, `=ssid=${spot.name}`],
                ['/interface/wireless/set', id.wifi, `=comment=${stationComment.replace(/current:(.+?) ::/, `current:${spot.name} ::`)}`],

                ['/interface/bridge/port/disable', id.bridge],
                ['/interface/ethernet/disable', id.ether],
                ['/interface/list/member/enable', id.list],

                ['/ip/dhcp-client/enable', id.dhcp],
            ]);

            log.station(spot);
        } else {
            const [, wifiName] = stationComment.match(/ap:(\w+)/);
            const [, apName] = stationComment.match(/ap:\w+ \[(.+?)]/);

            await mikrotik.write([
                ['/ip/cloud/set', '=ddns-enabled=yes'],

                ['/interface/wireless/set', id.wifi, '=security-profile=default'],
                ['/interface/wireless/set', id.wifi, '=mode=ap-bridge'],
                ['/interface/wireless/set', id.wifi, `=name=${wifiName}`],
                ['/interface/wireless/set', id.wifi, `=ssid=${apName}`],
                ['/interface/wireless/set', id.wifi, `=comment=${stationComment.replace(/current:(.+?) ::/, `current:${apName} ::`)}`],

                ['/interface/bridge/port/enable', id.bridge],
                ['/interface/ethernet/enable', id.ether],
                ['/interface/list/member/disable', id.list],

                ['/ip/dhcp-client/disable', id.dhcp],
            ]);

            log.station();
        }
    } catch (err) {
        print.ex(err, {full: true, exit: true});
    }
})();
